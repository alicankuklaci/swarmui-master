import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  STORAGE_INSTALL_EVENT,
  type InstallPlan,
  type InstallPlanStep,
  type NodeExecRequest,
  type NodeExecResult,
  type SharedStorageConfig,
  type StorageInstallStepEvent,
  type StorageState,
} from '@swarmui-master/storage-plan';
import { StorageAuditService } from './audit.service';
import { DriverRegistry } from './drivers/driver.registry';
import { NodeExecClient } from './node-exec.client';
import {
  SharedStorage,
  SharedStorageDocument,
} from './schemas/shared-storage.schema';
import { StorageStateMachine } from './state-machine';

// Install orchestrator — Sprint 2 D2.
//
// Owns the forward lifecycle of a shared-storage install: ask the driver for
// a plan, walk each step through node-exec, persist state transitions,
// write dual-sink audit entries, and emit SSE-friendly events along the way.
//
// Deliberately *not* a cron / background worker. The caller (StorageService
// .queueInstall) kicks off a single install coroutine and returns the
// session id immediately — the orchestrator writes everything it needs to
// resume from Mongo, so a backend restart mid-install picks up at the next
// step on the next explicit retry (Sprint 5 adds the automatic retry).
//
// Transport: depends on NodeExecClient directly. The real WebSocket transport
// lands in Sprint 3; Sprint 2 tests inject a mock NodeExecClient. Nothing in
// this file assumes a specific transport — only the client's contract (same
// request/result shape, same HMAC rules).
@Injectable()
export class InstallOrchestratorService {
  private readonly logger = new Logger(InstallOrchestratorService.name);
  private static readonly PRIMARY_ID = 'primary';

  constructor(
    @InjectModel(SharedStorage.name)
    private readonly storageModel: Model<SharedStorageDocument>,
    private readonly drivers: DriverRegistry,
    private readonly nodeExec: NodeExecClient,
    private readonly audit: StorageAuditService,
    private readonly emitter: EventEmitter2,
  ) {}

  // Entry point. Returns when the install run has reached a terminal state
  // (HEALTHY on success, UNINSTALL_FAILED on error). Never throws — all
  // errors are converted into a `failed` event + the terminal state. Callers
  // that want to know the outcome should subscribe to the event stream.
  async run(
    sessionId: string,
    config: SharedStorageConfig,
    initiatedBy: string,
  ): Promise<void> {
    const driver = this.drivers.get(config.backend);
    let plan: InstallPlan;
    try {
      plan = await driver.plan(config, sessionId);
    } catch (err) {
      // Plan generation failed (bad config). Nothing has run yet, so we can
      // leave the doc in PENDING and surface the cause.
      await this.emitFailed(sessionId, 'PENDING', (err as Error).message);
      return;
    }

    const sm = await this.openStateMachine(
      sessionId,
      config,
      initiatedBy,
      plan,
    );
    // Guard: openStateMachine already handled illegal entry by returning the
    // current machine. If we are not INSTALLING now, this is a resume of an
    // in-flight install that someone else has stopped — bail without touching
    // state.
    if (sm.current() !== 'INSTALLING') {
      this.logger.warn(
        `run(${sessionId}): state is ${sm.current()}, refusing to execute plan`,
      );
      return;
    }

    await this.emit({
      sessionId,
      phase: 'started',
      state: 'INSTALLING',
      frame: 0,
      ts: new Date().toISOString(),
    });

    // Resume: skip steps we already recorded as lastAttemptedStepId. The
    // design doc deliberately resumes at the *next* step, not re-running the
    // last one — most steps aren't idempotent (docker run, systemctl enable).
    const lastAttempted = await this.getLastAttemptedStepId(sessionId);
    let startIdx = 0;
    if (lastAttempted) {
      const idx = plan.steps.findIndex((s) => s.id === lastAttempted);
      if (idx < 0) {
        // D pack #4: resume marker references a step not in the current
        // plan (plan shape changed between crash and resume, or persistence
        // was corrupted). Silently resetting to 0 would silently re-run every
        // non-idempotent step. Terminate instead and surface the drift.
        this.logger.error(
          `run(${sessionId}): lastAttemptedStepId=${lastAttempted} not found in current plan ` +
            `(steps=${plan.steps.map((s) => s.id).join(',')}); refusing to re-run from step 0`,
        );
        try {
          sm.transition('UNINSTALL_FAILED');
          await this.persistState('INSTALLING', 'UNINSTALL_FAILED');
        } catch {
          /* state may already be terminal */
        }
        await this.emit({
          sessionId,
          phase: 'failed',
          state: 'UNINSTALL_FAILED',
          cause: `resume marker drift: step ${lastAttempted} not in plan`,
          frame: 0,
          ts: new Date().toISOString(),
        });
        return;
      }
      startIdx = idx + 1;
    }

    for (let i = startIdx; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const frame = i + 1;
      const result = await this.executeStep(step, sessionId, initiatedBy, frame);
      await this.persistLastAttempted(step.id);
      if (result.exitCode !== 0) {
        try {
          sm.transition('UNINSTALL_FAILED');
          await this.persistState('INSTALLING', 'UNINSTALL_FAILED');
        } catch {
          // State already terminal; ignore.
        }
        await this.emit({
          sessionId,
          phase: 'failed',
          state: 'UNINSTALL_FAILED',
          stepId: step.id,
          stepDescription: step.description,
          nodeId: step.nodeId,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          cause: result.stderrTail?.split('\n')[0]?.slice(0, 200),
          frame: plan.steps.length + 1,
          ts: new Date().toISOString(),
        });
        return;
      }
    }

    try {
      sm.transition('HEALTHY');
      await this.persistState('INSTALLING', 'HEALTHY');
    } catch (err) {
      this.logger.error(
        `run(${sessionId}): terminal transition failed: ${(err as Error).message}`,
      );
    }
    await this.emit({
      sessionId,
      phase: 'done',
      state: 'HEALTHY',
      frame: plan.steps.length + 1,
      ts: new Date().toISOString(),
    });
  }

  // Reverse lifecycle. Walks the driver's uninstallPlan() with the same
  // step-execution + audit path as install, but transitions through
  // DRAINING → UNINSTALLED. Preconditions (doc exists; state ∈ {HEALTHY,
  // DEGRADED}; no consumers) are enforced upstream by StorageService —
  // this method trusts the caller and emits a `failed` frame if the
  // state machine refuses the transition.
  async uninstall(
    sessionId: string,
    config: SharedStorageConfig,
    initiatedBy: string,
  ): Promise<void> {
    const driver = this.drivers.get(config.backend);
    let plan: InstallPlan;
    try {
      plan = await driver.uninstallPlan(config, sessionId);
    } catch (err) {
      await this.emitFailed(sessionId, 'HEALTHY', (err as Error).message);
      return;
    }

    const sm = await this.openStateMachineForUninstall(sessionId);
    if (sm.current() !== 'DRAINING') {
      this.logger.warn(
        `uninstall(${sessionId}): state is ${sm.current()}, refusing to execute plan`,
      );
      await this.emitFailed(
        sessionId,
        sm.current(),
        `uninstall refused: state=${sm.current()}`,
      );
      return;
    }

    await this.emit({
      sessionId,
      phase: 'started',
      state: 'DRAINING',
      frame: 0,
      ts: new Date().toISOString(),
    });

    // No resume marker for uninstall in v1 — every teardown step is
    // declared `terminalOnFail: true` in the driver's uninstallPlan, and
    // the operator is expected to fix the host before retrying. A
    // partial retry would race the half-torn-down cluster.
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const frame = i + 1;
      const result = await this.executeStep(
        step,
        sessionId,
        initiatedBy,
        frame,
        'DRAINING',
      );
      if (result.exitCode !== 0) {
        try {
          sm.transition('UNINSTALL_FAILED');
          await this.persistState('DRAINING', 'UNINSTALL_FAILED');
        } catch {
          /* already terminal */
        }
        await this.emit({
          sessionId,
          phase: 'failed',
          state: 'UNINSTALL_FAILED',
          stepId: step.id,
          stepDescription: step.description,
          nodeId: step.nodeId,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          cause: result.stderrTail?.split('\n')[0]?.slice(0, 200),
          frame: plan.steps.length + 1,
          ts: new Date().toISOString(),
        });
        return;
      }
    }

    try {
      sm.transition('UNINSTALLED');
      await this.persistState('DRAINING', 'UNINSTALLED');
    } catch (err) {
      this.logger.error(
        `uninstall(${sessionId}): terminal transition failed: ${(err as Error).message}`,
      );
    }
    await this.emit({
      sessionId,
      phase: 'done',
      state: 'UNINSTALLED',
      frame: plan.steps.length + 1,
      ts: new Date().toISOString(),
    });
  }

  // ----- step execution -----

  private async executeStep(
    step: InstallPlanStep,
    sessionId: string,
    initiatedBy: string,
    frame: number,
    inflightState: StorageState = 'INSTALLING',
  ): Promise<NodeExecResult> {
    const req: NodeExecRequest = this.nodeExec.buildRequest({
      commandId: step.commandId,
      args: step.args,
      nodeId: step.nodeId,
      installSessionId: sessionId,
    });
    let result: NodeExecResult;
    try {
      result = await this.nodeExec.send(req);
    } catch (err) {
      // Transport-level failure (DNS, auth, timeout). We synthesize a
      // NodeExecResult with exitCode=255 so the audit path and the step
      // event stay consistent with normal failures.
      result = {
        commandId: step.commandId,
        nodeId: step.nodeId,
        exitCode: 255,
        stdoutHash: '',
        stderrHash: '',
        stderrTail: (err as Error).message,
        durationMs: 0,
      };
    }
    await this.audit
      .write({
        userId: initiatedBy,
        installSessionId: sessionId,
        result,
        args: step.args,
      })
      .catch((err) => {
        // Audit failure is already logged inside the service. We don't
        // propagate — losing an audit line should not take down the install;
        // operators can reconcile from stderr in the SSE stream.
        this.logger.error(
          `audit write failed for step ${step.id}: ${(err as Error).message}`,
        );
      });
    await this.emit({
      sessionId,
      phase: 'step',
      state: result.exitCode === 0 ? inflightState : 'UNINSTALL_FAILED',
      stepId: step.id,
      stepDescription: step.description,
      nodeId: step.nodeId,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      cause:
        result.exitCode !== 0
          ? result.stderrTail?.split('\n')[0]?.slice(0, 200)
          : undefined,
      frame,
      ts: new Date().toISOString(),
    });
    return result;
  }

  // ----- state machine helpers -----

  // A pack #2: atomic install acquire.
  //
  // Previously this did findById → branch → updateOne, which lets two
  // concurrent queueInstall POSTs both see state=PENDING and both call
  // persistState('INSTALLING'); last writer wins but both coroutines run
  // their plans against the same cluster. The compound-filter
  // findOneAndUpdate below is a Mongo-level mutex: at most one caller
  // transitions PENDING/UNINSTALLED → INSTALLING, the loser falls through
  // to case D (refuse) and run() bails.
  //
  // Case A — resume same install session (state=INSTALLING + session match)
  // Case B — acquire from PENDING or UNINSTALLED (compound-filter update)
  // Case C — first install ever (atomic create; _id unique index acts as the lock)
  // Case D — someone else holds the lock → return current state, run() bails
  private async openStateMachine(
    sessionId: string,
    config: SharedStorageConfig,
    initiatedBy: string,
    plan: InstallPlan,
  ): Promise<StorageStateMachine> {
    // Case A: resume same session.
    const resumed = await this.storageModel
      .findOne({
        _id: InstallOrchestratorService.PRIMARY_ID,
        state: 'INSTALLING' satisfies StorageState,
        installSessionId: sessionId,
      })
      .lean()
      .exec();
    if (resumed) {
      return StorageStateMachine.fromPersisted(resumed.state);
    }

    // Case B: acquire from PENDING or UNINSTALLED atomically. On success
    // the doc's state is already INSTALLING by the time this returns, and
    // any concurrent caller finds state=INSTALLING (fails the $in filter)
    // and falls through to case D.
    const acquired = await this.storageModel
      .findOneAndUpdate(
        {
          _id: InstallOrchestratorService.PRIMARY_ID,
          state: { $in: ['PENDING', 'UNINSTALLED'] satisfies StorageState[] },
        },
        {
          $set: {
            state: 'INSTALLING' satisfies StorageState,
            installSessionId: sessionId,
            lastAttemptedStepId: null,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (acquired) {
      return new StorageStateMachine('INSTALLING');
    }

    // Case C: no doc exists. Create atomically — the _id unique index means
    // two concurrent callers can't both create; the loser catches
    // E11000 duplicate key and falls through to case D.
    try {
      await this.storageModel.create({
        _id: InstallOrchestratorService.PRIMARY_ID,
        backend: config.backend,
        driver: config.backend,
        nodes: config.nodes,
        mountPoint: plan.mountPoint,
        state: 'INSTALLING' satisfies StorageState,
        installSessionId: sessionId,
        driverOpts: plan.driverOpts,
        initiatedBy,
      });
      return new StorageStateMachine('INSTALLING');
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code !== 11000) throw err;
      // Fall through: another create won.
    }

    // Case D: refuse. Return the current state so run() can bail.
    const doc = await this.storageModel
      .findById(InstallOrchestratorService.PRIMARY_ID)
      .lean()
      .exec();
    return StorageStateMachine.fromPersisted(doc?.state ?? 'PENDING');
  }

  // Uninstall path verifier. StorageService.queueUninstall is now the
  // atomic HEALTHY/DEGRADED → DRAINING acquirer (see A pack #11 fix in
  // storage.service.ts), so by the time this method runs the DRAINING state
  // is already persisted. We just read + check — no transition. A race (a
  // reconciler flip, or a competing uninstall) shows up here as current()
  // != 'DRAINING', and the caller bails without touching state.
  private async openStateMachineForUninstall(
    _sessionId: string,
  ): Promise<StorageStateMachine> {
    const doc = await this.storageModel
      .findById(InstallOrchestratorService.PRIMARY_ID)
      .lean()
      .exec();
    if (!doc) {
      // Shouldn't happen if StorageService guarded correctly; synthesize a
      // PENDING machine so the caller sees DRAINING-check-failed.
      return new StorageStateMachine('PENDING');
    }
    return StorageStateMachine.fromPersisted(doc.state);
  }

  // A pack #1: every state write below carries the expected from-state in
  // its filter and refuses silently if the DB has moved. Prevents the
  // reconciler and the orchestrator from clobbering each other's state
  // writes. Returns true if the write landed, false otherwise — callers
  // may want to abort further work, but for most sites a logged skip is
  // enough since the sm in-memory diverges from the DB only until the
  // request returns.
  private async persistState(
    expectedFrom: StorageState | StorageState[],
    to: StorageState,
    extras: Record<string, unknown> = {},
  ): Promise<boolean> {
    const fromFilter = Array.isArray(expectedFrom)
      ? { $in: expectedFrom }
      : expectedFrom;
    const res = await this.storageModel
      .updateOne(
        {
          _id: InstallOrchestratorService.PRIMARY_ID,
          state: fromFilter,
        },
        { $set: { state: to, ...extras } },
      )
      .exec();
    if ((res.matchedCount ?? 0) === 0) {
      this.logger.warn(
        `persistState skipped: expected state=${JSON.stringify(expectedFrom)}, actual has moved (target state=${to})`,
      );
      return false;
    }
    return true;
  }

  private async persistLastAttempted(stepId: string): Promise<void> {
    await this.storageModel
      .updateOne(
        { _id: InstallOrchestratorService.PRIMARY_ID },
        { $set: { lastAttemptedStepId: stepId } },
      )
      .exec();
  }

  private async getLastAttemptedStepId(
    sessionId: string,
  ): Promise<string | undefined> {
    const doc = await this.storageModel
      .findById(InstallOrchestratorService.PRIMARY_ID)
      .lean()
      .exec();
    if (!doc) return undefined;
    // Only resume within the same install session; a new session must start
    // from step 0.
    if (doc.installSessionId !== sessionId) return undefined;
    return doc.lastAttemptedStepId;
  }

  // ----- event helpers -----

  private async emit(frame: StorageInstallStepEvent): Promise<void> {
    try {
      this.emitter.emit(STORAGE_INSTALL_EVENT, frame);
    } catch (err) {
      this.logger.error(
        `event emit failed for session ${frame.sessionId}: ${(err as Error).message}`,
      );
    }
  }

  private async emitFailed(
    sessionId: string,
    state: StorageState,
    cause: string,
  ): Promise<void> {
    await this.emit({
      sessionId,
      phase: 'failed',
      state,
      cause: cause.slice(0, 200),
      frame: 0,
      ts: new Date().toISOString(),
    });
  }
}
