import { NextResponse } from "next/server";
import { IntakeState, ProcessChunkRequest, TranscriptChunk } from "@/lib/types";
import { appendTranscriptChunk, recompute, processExtraction } from "@/lib/rules";
import { runExtraction } from "@/lib/llmExtraction";
import { createInitialIntakeState } from "@/lib/initialState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function makeChunk(text: string, speaker: ProcessChunkRequest["speaker"]): TranscriptChunk {
  return {
    id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: text.trim(),
    speaker: speaker ?? "customer",
    createdAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  let body: ProcessChunkRequest;
  try {
    body = (await request.json()) as ProcessChunkRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { transcriptChunkText, speaker } = body;
  const currentState: IntakeState = body.currentState ?? createInitialIntakeState();
  if (!transcriptChunkText || !transcriptChunkText.trim()) {
    return NextResponse.json({ error: "Missing transcriptChunkText" }, { status: 400 });
  }

  const chunk = makeChunk(transcriptChunkText, speaker);

  let extraction;
  let mode: "llm" | "mock";
  try {
    const run = await runExtraction(currentState, chunk.text);
    extraction = run.result;
    mode = run.mode;
  } catch {
    // LLM configured but both attempts failed — safe no-op: keep the chunk,
    // change no fields, and recompute the next question from unchanged state.
    const withChunk: IntakeState = {
      ...appendTranscriptChunk(currentState, chunk),
      generation: currentState.generation + 1,
    };
    const recomputed = recompute(withChunk);
    return NextResponse.json({
      updatedState: recomputed.state,
      nextBestQuestion: recomputed.nextBestQuestion,
      reasons: ["Extraction unavailable for this chunk — no fields changed. Try again.", ...recomputed.reasons],
      extractorMode: "llm",
      extractionError: true,
    });
  }

  const { state, nextBestQuestion, reasons } = processExtraction(currentState, extraction, chunk);

  return NextResponse.json({
    updatedState: state,
    nextBestQuestion,
    reasons,
    extractorMode: mode,
  });
}
