// Recursive timeout avoids overlapping scheduled runs, handles long intervals,
// and lets settings changes cancel the previous generation.
export class SyncScheduler {
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  nextRunAt: string | null = null;
  stop() {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.nextRunAt = null;
  }
  start(hours: number, task: () => Promise<unknown>) {
    this.stop();
    const generation = this.generation;
    const schedule = () => {
      const due = Date.now() + hours * 3600_000;
      this.nextRunAt = new Date(due).toISOString();
      const tick = () => {
        if (generation !== this.generation) return;
        const remaining = due - Date.now();
        if (remaining > 0) {
          this.timer = setTimeout(tick, Math.min(remaining, 2_147_483_647));
          this.timer.unref?.();
          return;
        }
        this.nextRunAt = null;
        void task()
          .catch(() => undefined)
          .finally(() => {
            if (generation === this.generation) schedule();
          });
      };
      tick();
    };
    schedule();
  }
}
