// Generic transcript input interface. The MVP uses ManualTranscriptSource
// (typed / simulated chunks). A DeepgramTranscriptSource can implement the same
// interface later without touching the copilot engine or UI.

export interface IncomingTranscriptChunk {
  text: string;
  speaker?: "agent" | "customer" | "unknown";
}

export interface TranscriptSource {
  readonly id: string;
  /** Subscribe to incoming chunks. Returns an unsubscribe function. */
  subscribe(onChunk: (chunk: IncomingTranscriptChunk) => void): () => void;
  start?(): Promise<void> | void;
  stop?(): Promise<void> | void;
}

// Manual / simulated source: the app pushes chunks in explicitly (button-driven).
export class ManualTranscriptSource implements TranscriptSource {
  readonly id = "manual";
  private listeners = new Set<(chunk: IncomingTranscriptChunk) => void>();

  subscribe(onChunk: (chunk: IncomingTranscriptChunk) => void): () => void {
    this.listeners.add(onChunk);
    return () => this.listeners.delete(onChunk);
  }

  push(chunk: IncomingTranscriptChunk): void {
    for (const listener of this.listeners) listener(chunk);
  }
}
