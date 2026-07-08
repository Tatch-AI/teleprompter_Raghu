import { NextResponse } from "next/server";
import { IntakeState } from "@/lib/types";
import { processTranscriptCorrection } from "@/lib/rules";
import { runExtraction } from "@/lib/llmExtraction";
import { logExtractionEvents } from "@/lib/extractionLog";
import { logTranscriptCorrection } from "@/lib/transcriptCorrectionLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CorrectChunkRequest {
  chunkId: string;
  correctedText: string;
  currentState: IntakeState;
}

export async function POST(request: Request) {
  let body: CorrectChunkRequest;
  try {
    body = (await request.json()) as CorrectChunkRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { chunkId, correctedText, currentState } = body;
  if (!chunkId || !correctedText || !correctedText.trim() || !currentState) {
    return NextResponse.json({ error: "Missing chunkId, correctedText, or currentState" }, { status: 400 });
  }

  const originalChunk = currentState.transcriptChunks.find((c) => c.id === chunkId);
  if (!originalChunk) {
    return NextResponse.json({ error: "Chunk not found in currentState" }, { status: 404 });
  }
  if (originalChunk.text.trim() === correctedText.trim()) {
    return NextResponse.json({ error: "Corrected text is identical to the original" }, { status: 400 });
  }

  const intakeId = currentState.intakeId;
  const extractionStart = performance.now();
  let extraction;
  let mode: "llm" | "mock";
  try {
    const run = await runExtraction(currentState, correctedText);
    extraction = run.result;
    mode = run.mode;
  } catch (err) {
    console.log(
      `[correct-chunk] intake=${intakeId} stage=extraction status=failed elapsedMs=${(performance.now() - extractionStart).toFixed(1)} error=${(err as Error).message}`,
    );
    return NextResponse.json(
      { error: "Extraction unavailable — the transcript correction was not applied. Try again." },
      { status: 502 },
    );
  }

  const result = processTranscriptCorrection(currentState, chunkId, correctedText, extraction);
  if (!result) {
    return NextResponse.json({ error: "Chunk not found in currentState" }, { status: 404 });
  }

  // Log the raw ASR-vs-corrected pair (mainly a proper-noun signal for future
  // keyterm-boost tuning) and every extraction candidate the corrected text produced,
  // same as the live chunk path.
  logTranscriptCorrection({
    id: `corr-${chunkId}-${Date.now()}`,
    intakeId,
    chunkId,
    speaker: originalChunk.speaker,
    originalText: originalChunk.text,
    correctedText: correctedText.trim(),
    createdAt: new Date().toISOString(),
  });
  logExtractionEvents(
    currentState,
    { id: chunkId, text: correctedText.trim(), speaker: originalChunk.speaker, createdAt: originalChunk.createdAt },
    extraction,
    mode,
  );

  console.log(
    `[correct-chunk] intake=${intakeId} chunkId=${chunkId} fieldsExtracted=${extraction.extractedFields.length} extractionMs=${(performance.now() - extractionStart).toFixed(1)} businessType=${result.state.businessType ?? "null"} askNext=${result.nextBestQuestion.category}`,
  );

  return NextResponse.json({
    updatedState: result.state,
    nextBestQuestion: result.nextBestQuestion,
    reasons: result.reasons,
    extractorMode: mode,
  });
}
