import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { TranscriptCorrectionEvent } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CORRECTION_LOG_FILE = path.join(DATA_DIR, "transcript_corrections.jsonl");

// Server-only, fire-and-forget — same pattern as lib/extractionLog.ts. Mainly a proper-noun
// signal (business/owner names ASR mishears and no keyterm-boost list fully covers), so the
// full original/corrected text pair is kept rather than a diff — which specific words
// changed is an analysis-time question, not a capture-time one.
export function logTranscriptCorrection(event: TranscriptCorrectionEvent): void {
  const line = `${JSON.stringify(event)}\n`;
  void (async () => {
    try {
      await mkdir(DATA_DIR, { recursive: true });
      await appendFile(CORRECTION_LOG_FILE, line, "utf8");
    } catch {
      /* non-blocking: logging must never break the live call */
    }
  })();
}
