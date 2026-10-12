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
    const startIdx = lastAttempted
      ? plan.steps.findIndex((s) => s.id === lastAttempted) + 1
      : 0;

    for (let i = startIdx; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const frame = i + 1;
      const result = await this.executeStep(step, sessionId, initiatedBy, frame);
      await this.persistLastAttempted(step.id);
      if (result.exitCode !== 0) {
        try {
          sm.transition('UNINSTALL_FAILED');
          await this.persistState('UNINSTALL_FAILED');
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
      await this.persistState('HEALTHY');
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
          await this.persistState('UNINSTALL_FAILED');
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
      await this.persistState('UNINSTALLED');
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

  private async openStateMachine(
    sessionId: string,
    config: SharedStorageConfig,
    initiatedBy: string,
    plan: InstallPlan,
  ): Promise<StorageStateMachine> {
    const doc = await this.storageModel
      .findById(InstallOrchestratorService.PRIMARY_ID)
      .lean()
      .exec();
    if (!doc) {
      // First-ever install. Create the singleton in PENDING, then flip.
      await this.storageModel.create({
        _id: InstallOrchestratorService.PRIMARY_ID,
        backend: config.backend,
        driver: config.backend,
        nodes: config.nodes,
        mountPoint: plan.mountPoint,
        state: 'PENDING' satisfies StorageState,
        installSessionId: sessionId,
        driverOpts: plan.driverOpts,
        initiatedBy,
      });
      const sm = new StorageStateMachine('PENDING');
      sm.transition('INSTALLING');
      await this.persistState('INSTALLING', sessionId);
      return sm;
    }
    // Existing doc: resume if the install session matches, otherwise
    // refuse. A new install over an existing one must go through uninstall
    // first — PENDING isn't reachable from HEALTHY/DEGRADED/… in the FSM.
    if (doc.state === 'UNINSTALLED' || doc.state === 'PENDING') {
      const sm = StorageStateMachine.fromPersisted(doc.state);
      // UNINSTALLED → PENDING → INSTALLING. The intermediate PENDING is a
      // real state (operator can see "install starting over") so we persist
      // it, but we don't emit between the two: the orchestrator's own
      // `started` frame carries INSTALLING, which is what SSE clients
      // actually read.
      if (sm.current() === 'UNINSTALLED') {
        sm.transition('PENDING');
        await this.persistState('PENDING', sessionId);
      }
      sm.transition('INSTALLING');
      // Fresh session: clear the resume marker from a prior run or we'd
      // skip steps the new plan expects to execute from scratch.
      await this.resetForNewSession(sessionId);
      return sm;
    }
    if (doc.state === 'INSTALLING' && doc.installSessionId === sessionId) {
      // Resume same install session.
      return StorageStateMachine.fromPersisted(doc.state);
    }
    // Any other state → return the machine without transitioning. run()
    // checks current()!=='INSTALLING' and bails.
    return StorageStateMachine.fromPersisted(doc.state);
  }

  // Mirror of openStateMachine but for the uninstall path. Caller
  // (StorageService.queueUninstall) has already validated preconditions —
  // doc exists, state is HEALTHY or DEGRADED, zero consumers. We transition
  // HEALTHY → DRAINING (or DEGRADED → DRAINING) and persist before any step
  // runs so a mid-uninstall crash leaves the DB consistent with "we started
  // tearing down". A stale state (someone kicked another op) returns the
  // state machine untouched and the caller bails.
  private async openStateMachineForUninstall(
    sessionId: string,
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
    const sm = StorageStateMachine.fromPersisted(doc.state);
    if (sm.current() === 'HEALTHY' || sm.current() === 'DEGRADED') {
      sm.transition('DRAINING');
      await this.storageModel
        .updateOne(
          { _id: InstallOrchestratorService.PRIMARY_ID },
          {
            $set: {
              state: 'DRAINING' satisfies StorageState,
              installSessionId: sessionId,
              lastAttemptedStepId: null,
            },
          },
        )
        .exec();
    }
    return sm;
  }

  private async persistState(
    state: StorageState,
    installSessionId?: string,
  ): Promise<void> {
    const update: Record<string, unknown> = { state };
    if (installSessionId !== undefined) update.installSessionId = installSessionId;
    await this.storageModel
      .updateOne({ _id: InstallOrchestratorService.PRIMARY_ID }, { $set: update })
      .exec();
  }

  private async resetForNewSession(sessionId: string): Promise<void> {
    await this.storageModel
      .updateOne(
        { _id: InstallOrchestratorService.PRIMARY_ID },
        {
          $set: {
            state: 'INSTALLING' satisfies StorageState,
            installSessionId: sessionId,
            lastAttemptedStepId: null,
          },
        },
      )
      .exec();
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
