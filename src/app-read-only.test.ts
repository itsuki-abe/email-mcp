import type { AppServices } from './app.js';
import { startBackgroundServices } from './app.js';

vi.mock('./logging.js', () => ({ mcpLog: vi.fn().mockResolvedValue(undefined) }));

describe('read-only background services', () => {
  afterEach(() => vi.useRealTimers());

  it.each([true, false])('gates automatic writes with readOnly=%s', async (readOnly) => {
    vi.useFakeTimers();
    const hooks = { start: vi.fn(), stop: vi.fn() };
    const verification = { start: vi.fn(), stop: vi.fn() };
    const scheduler = { checkAndSend: vi.fn().mockResolvedValue({ sent: 0 }) };
    const watcher = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn() };
    const services = {
      config: {
        settings: { readOnly, verification: { enabled: false }, watcher: { enabled: false } },
      },
      hooksService: hooks,
      verificationCatcher: verification,
      schedulerService: scheduler,
      watcherService: watcher,
      imapService: { dispose: vi.fn() },
    } as unknown as AppServices;
    const handle = startBackgroundServices(services, null);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(hooks.start).toHaveBeenCalledTimes(readOnly ? 0 : 1);
    expect(verification.start).toHaveBeenCalledTimes(readOnly ? 0 : 1);
    expect(scheduler.checkAndSend).toHaveBeenCalledTimes(readOnly ? 0 : 2);
    expect(watcher.start).toHaveBeenCalledOnce();
    await handle.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
