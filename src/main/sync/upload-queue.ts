type UploadHandler = (localPath: string) => Promise<void>;

export interface QueueSnapshot {
  queueSize: number;
  activeUploads: number;
}

export class UploadQueue {
  private readonly pending: string[] = [];
  private readonly activePaths = new Set<string>();
  private readonly queued = new Set<string>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private activeUploads = 0;
  private paused = false;

  constructor(
    private readonly concurrency: number,
    private readonly upload: UploadHandler,
    private readonly onChange: () => void
  ) {}

  enqueue(localPath: string, delayMs = 700): void {
    const existingTimer = this.timers.get(localPath);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.timers.delete(localPath);
      this.add(localPath);
    }, delayMs);

    this.timers.set(localPath, timer);
    this.onChange();
  }

  snapshot(): QueueSnapshot {
    return {
      queueSize: this.pending.length + this.timers.size,
      activeUploads: this.activeUploads
    };
  }

  isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
    this.onChange();
  }

  resume(): void {
    this.paused = false;
    this.onChange();
    void this.pump();
  }

  clearPending(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.timers.clear();
    this.pending.length = 0;
    this.queued.clear();

    for (const activePath of this.activePaths) {
      this.queued.add(activePath);
    }

    this.onChange();
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.paused = true;
    this.timers.clear();
    this.pending.length = 0;
    this.queued.clear();
    this.onChange();
  }

  private add(localPath: string): void {
    if (this.queued.has(localPath)) {
      return;
    }

    this.queued.add(localPath);
    this.pending.push(localPath);
    this.onChange();
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.paused) {
      return;
    }

    while (this.activeUploads < this.concurrency && this.pending.length > 0) {
      const next = this.pending.shift();

      if (!next) {
        continue;
      }

      this.activeUploads += 1;
      this.activePaths.add(next);
      this.onChange();

      void this.upload(next)
        .catch(() => undefined)
        .finally(() => {
          this.activeUploads -= 1;
          this.activePaths.delete(next);
          this.queued.delete(next);
          this.onChange();
          void this.pump();
        });
    }
  }
}
