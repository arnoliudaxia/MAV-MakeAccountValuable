import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncScheduler } from "./scheduler";

afterEach(() => vi.useRealTimers());
describe("SyncScheduler", () => {
  it("uses the requested interval, avoids overlap, and restarts/cancels", async () => {
    vi.useFakeTimers();
    const scheduler = new SyncScheduler();
    let finish!: () => void;
    const task = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    scheduler.start(24, task);
    await vi.advanceTimersByTimeAsync(24 * 3600_000 - 1);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(48 * 3600_000);
    expect(task).toHaveBeenCalledTimes(1);
    const replacement = vi.fn(async () => undefined);
    scheduler.start(1, replacement);
    finish();
    await vi.advanceTimersByTimeAsync(3600_000);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledTimes(1);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(24 * 3600_000);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(scheduler.nextRunAt).toBeNull();
  });
  it("supports intervals above Node's maximum timeout", async () => {
    vi.useFakeTimers();
    const scheduler = new SyncScheduler();
    const task = vi.fn(async () => undefined);
    scheduler.start(8760, task);
    await vi.advanceTimersByTimeAsync(8760 * 3600_000 - 1);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });
});
