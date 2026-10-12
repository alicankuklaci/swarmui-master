import { ExecutionContext } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import {
  STORAGE_INSTALL_EVENT,
  type StorageInstallStepEvent,
} from '@swarmui-master/storage-plan';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

// Thin tests for the controller's SSE wiring. The service is already covered
// by the orchestrator spec; here we only prove that:
//   - events for other sessions are filtered out
//   - events for this session reach the subscriber in order
//   - a terminal frame completes the observable
//   - the listener is removed on teardown (no leak per SSE connection)

describe('StorageController (SSE)', () => {
  let controller: StorageController;
  let emitter: EventEmitter2;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        {
          provide: StorageService,
          useValue: { getStatus: jest.fn(), queueInstall: jest.fn(), queueUninstall: jest.fn() },
        },
        EventEmitter2,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (_: ExecutionContext) => true })
      .compile();
    controller = mod.get(StorageController);
    emitter = mod.get(EventEmitter2);
  });

  const frame = (
    sessionId: string,
    phase: StorageInstallStepEvent['phase'],
    frameN: number,
    extra: Partial<StorageInstallStepEvent> = {},
  ): StorageInstallStepEvent => ({
    sessionId,
    phase,
    state: phase === 'done' ? 'HEALTHY' : 'INSTALLING',
    frame: frameN,
    ts: new Date().toISOString(),
    ...extra,
  });

  // Admin bypasses the per-user authz check (Sprint 8 security). The SSE
  // method is now async because the authz path reads the doc, so each
  // test awaits the observable before subscribing.
  const adminReq = { user: { id: 'admin-1', role: 'admin' } };

  it('forwards events for the subscribed session and ignores others', async () => {
    const received: MessageEvent[] = [];
    const obs = await controller.streamInstallEvents('sess-A', adminReq);
    const sub = obs.subscribe({ next: (m) => received.push(m) });

    emitter.emit(STORAGE_INSTALL_EVENT, frame('sess-B', 'step', 1)); // ignored
    emitter.emit(STORAGE_INSTALL_EVENT, frame('sess-A', 'started', 0));
    emitter.emit(STORAGE_INSTALL_EVENT, frame('sess-A', 'step', 1, { stepId: 's01' }));
    emitter.emit(STORAGE_INSTALL_EVENT, frame('sess-B', 'done', 2)); // ignored
    emitter.emit(STORAGE_INSTALL_EVENT, frame('sess-A', 'done', 2));

    expect(received).toHaveLength(3);
    const parsed = received.map((m) => JSON.parse(m.data as string));
    expect(parsed.map((p) => p.phase)).toEqual(['started', 'step', 'done']);
    expect(received.map((m) => m.lastEventId)).toEqual(['0', '1', '2']);

    sub.unsubscribe();
  });

  it('completes the observable on a done frame', async () => {
    const completed = jest.fn();
    const obs = await controller.streamInstallEvents('sess-C', adminReq);
    const sub = obs.subscribe({ complete: completed });

    emitter.emit(STORAGE_INSTALL_EVENT, frame('sess-C', 'step', 1));
    expect(completed).not.toHaveBeenCalled();
    emitter.emit(STORAGE_INSTALL_EVENT, frame('sess-C', 'done', 2));
    expect(completed).toHaveBeenCalledTimes(1);

    sub.unsubscribe();
  });

  it('completes the observable on a failed frame', async () => {
    const completed = jest.fn();
    const obs = await controller.streamInstallEvents('sess-D', adminReq);
    const sub = obs.subscribe({ complete: completed });

    emitter.emit(STORAGE_INSTALL_EVENT, frame('sess-D', 'failed', 2, { state: 'UNINSTALL_FAILED' }));
    expect(completed).toHaveBeenCalledTimes(1);

    sub.unsubscribe();
  });

  it('removes its listener on unsubscribe (no leak per connection)', async () => {
    const before = emitter.listenerCount(STORAGE_INSTALL_EVENT);
    const obs = await controller.streamInstallEvents('sess-E', adminReq);
    const sub = obs.subscribe();
    expect(emitter.listenerCount(STORAGE_INSTALL_EVENT)).toBe(before + 1);
    sub.unsubscribe();
    expect(emitter.listenerCount(STORAGE_INSTALL_EVENT)).toBe(before);
  });

  // Sprint 8 security: per-user authz. A non-admin whose user id doesn't
  // match the install's initiatedBy gets a 404 (deliberately not 403 — the
  // existence of another user's session is itself the side-channel).
  it('refuses a non-admin whose user id does not match initiatedBy', async () => {
    const svc = { getStatus: jest.fn().mockResolvedValue({
      installSessionId: 'sess-F',
      initiatedBy: 'alice',
    }) };
    const mod = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        { provide: StorageService, useValue: svc },
        EventEmitter2,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (_: ExecutionContext) => true })
      .compile();
    const c = mod.get(StorageController);
    await expect(
      c.streamInstallEvents('sess-F', { user: { id: 'bob', role: 'user' } }),
    ).rejects.toThrow(/not found or not accessible/);
  });

  it('allows a non-admin tailing their own install session', async () => {
    const svc = { getStatus: jest.fn().mockResolvedValue({
      installSessionId: 'sess-G',
      initiatedBy: 'alice',
    }) };
    const mod = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        { provide: StorageService, useValue: svc },
        EventEmitter2,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (_: ExecutionContext) => true })
      .compile();
    const c = mod.get(StorageController);
    const obs = await c.streamInstallEvents('sess-G', {
      user: { id: 'alice', role: 'user' },
    });
    expect(obs).toBeTruthy();
  });
});
