import { IntakeState, NextBestQuestion, TranscriptChunk } from "./types";
import { appendTranscriptChunk, recompute, processExtraction } from "./rules";
import { runExtraction } from "./llmExtraction";
import { logExtractionEvents } from "./extractionLog";

export interface ProcessIntakeTextResult {
  updatedState: IntakeState;
  nextBestQuestion: NextBestQuestion;
  reasons: string[];
  extractorMode: "llm" | "mock";
  extractionError?: boolean;
}

export function makeChunk(text: string, speaker: TranscriptChunk["speaker"]): TranscriptChunk {
  return {
    id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: text.trim(),
    speaker: speaker ?? "customer",
    createdAt: new Date().toISOString(),
  };
}

// Shared by every text-producing input feed (live transcript chunks, manual
// chunks, uploaded documents) so extraction, logging, and the rules engine
// stay in exactly one place regardless of where the text came from.
export async function processIntakeText(
  currentState: IntakeState,
  text: string,
  speaker: TranscriptChunk["speaker"],
  logLabel: string,
): Promise<ProcessIntakeTextResult> {
  const requestStart = performance.now();
  const chunk = makeChunk(text, speaker);
  const intakeId = currentState.intakeId;

  let extraction;
  let mode: "llm" | "mock";
  const extractionStart = performance.now();
  try {
    const run = await runExtraction(currentState, chunk.text);
    extraction = run.result;
    mode = run.mode;
  } catch (err) {
    console.log(
      `[${logLabel}] intake=${intakeId} stage=extraction status=failed elapsedMs=${(performance.now() - extractionStart).toFixed(1)} error=${(err as Error).message}`,
    );
    // LLM configured but both attempts failed — safe no-op: keep the chunk,
    // change no fields, and recompute the next question from unchanged state.
    const withChunk: IntakeState = {
      ...appendTranscriptChunk(currentState, chunk),
      generation: currentState.generation + 1,
    };
    const recomputed = recompute(withChunk);
    return {
      updatedState: recomputed.state,
      nextBestQuestion: recomputed.nextBestQuestion,
      reasons: ["Extraction unavailable for this chunk — no fields changed. Try again.", ...recomputed.reasons],
      extractorMode: "llm",
      extractionError: true,
    };
  }
  const extractionMs = performance.now() - extractionStart;

  // Fire-and-forget: preserves every extraction candidate (not just the
  // latest per field) so confidence calibration can be measured later
  // against the full history, not a single snapshot. Never awaited — must
  // not add latency to the caller.
  logExtractionEvents(currentState, chunk, extraction, mode);

  const rulesStart = performance.now();
  const { state, nextBestQuestion, reasons } = processExtraction(currentState, extraction, chunk);
  const rulesMs = performance.now() - rulesStart;

  console.log(
    `[${logLabel}] intake=${intakeId} stage=complete mode=${mode} fieldsExtracted=${extraction.extractedFields.length} extractionMs=${extractionMs.toFixed(1)} rulesMs=${rulesMs.toFixed(1)} totalMs=${(performance.now() - requestStart).toFixed(1)} businessType=${state.businessType ?? "null"} askNext=${nextBestQuestion.category}`,
  );

  return { updatedState: state, nextBestQuestion, reasons, extractorMode: mode };
}
