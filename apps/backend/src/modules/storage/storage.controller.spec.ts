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

  it('forwards events for the subscribed session and ignores others', async () => {
    const received: MessageEvent[] = [];
    const sub = controller
      .streamInstallEvents('sess-A')
      .subscribe({ next: (m) => received.push(m) });

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
    const sub = controller
      .streamInstallEvents('sess-C')
      .subscribe({ complete: completed });

    emitter.emit(STORAGE_INSTALL_EVENT, frame('sess-C', 'step', 1));
    expect(completed).not.toHaveBeenCalled();
    emitter.emit(STORAGE_INSTALL_EVENT, frame('sess-C', 'done', 2));
    expect(completed).toHaveBeenCalledTimes(1);

    sub.unsubscribe();
  });

  it('completes the observable on a failed frame', async () => {
    const completed = jest.fn();
    const sub = controller
      .streamInstallEvents('sess-D')
      .subscribe({ complete: completed });

    emitter.emit(STORAGE_INSTALL_EVENT, frame('sess-D', 'failed', 2, { state: 'UNINSTALL_FAILED' }));
    expect(completed).toHaveBeenCalledTimes(1);

    sub.unsubscribe();
  });

  it('removes its listener on unsubscribe (no leak per connection)', () => {
    const before = emitter.listenerCount(STORAGE_INSTALL_EVENT);
    const sub = controller.streamInstallEvents('sess-E').subscribe();
    expect(emitter.listenerCount(STORAGE_INSTALL_EVENT)).toBe(before + 1);
    sub.unsubscribe();
    expect(emitter.listenerCount(STORAGE_INSTALL_EVENT)).toBe(before);
  });
});
