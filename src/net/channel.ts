// A minimal message pipe. The online duel protocol only needs this, so it can run over WebRTC or in memory.
export interface Channel {
  send(data: string): void;
  close(): void;
  onMessage: ((data: string) => void) | null;
  onClose: (() => void) | null;
}

/** Two connected in-memory channels (used by the tests). Messages arrive asynchronously and in order. */
export function memoryPair(): [Channel, Channel] {
  const make = (): Channel & { peer?: Channel & { closed?: boolean }; closed?: boolean } => ({
    onMessage: null,
    onClose: null,
    send(data) {
      const p = this.peer;
      if (!p || this.closed) return;
      queueMicrotask(() => p.onMessage?.(data));
    },
    close() {
      if (this.closed) return;
      this.closed = true;
      const p = this.peer;
      queueMicrotask(() => {
        this.onClose?.();
        if (p && !p.closed) {
          p.closed = true;
          p.onClose?.();
        }
      });
    },
  });
  const a = make();
  const b = make();
  a.peer = b;
  b.peer = a;
  return [a, b];
}
