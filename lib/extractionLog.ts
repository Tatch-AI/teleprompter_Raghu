import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ExtractionEvent, ExtractionResult, IntakeState, TranscriptChunk } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const EXTRACTION_LOG_FILE = path.join(DATA_DIR, "extraction_events.jsonl");

// Server-only: appends one line per extracted candidate from a single pass.
// Never awaited by the request path that returns to the rep — a slow disk
// must not add latency to a live call, and a failed write must not break it.
export function logExtractionEvents(
  state: IntakeState,
  chunk: TranscriptChunk,
  extraction: ExtractionResult,
  mode: "llm" | "mock",
): void {
  if (extraction.extractedFields.length === 0) return;

  const lines = extraction.extractedFields.map((f) => {
    const event: ExtractionEvent = {
      id: `ext-${chunk.id}-${f.fieldId}`,
      intakeId: state.intakeId,
      chunkId: chunk.id,
      fieldId: f.fieldId,
      value: f.value,
      normalizedValue: f.normalizedValue,
      confidence: f.confidence,
      evidenceQuote: f.evidenceQuote,
      extractorMode: mode,
      businessType: state.businessType,
      createdAt: new Date().toISOString(),
    };
    return `${JSON.stringify(event)}\n`;
  });

  void (async () => {
    try {
      await mkdir(DATA_DIR, { recursive: true });
      await appendFile(EXTRACTION_LOG_FILE, lines.join(""), "utf8");
    } catch {
      /* non-blocking: logging must never break the live call */
    }
  })();
}
