import { NextResponse } from "next/server";
import { IntakeState, ProcessChunkRequest } from "@/lib/types";
import { createInitialIntakeState } from "@/lib/initialState";
import { processIntakeText } from "@/lib/processIntakeText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const result = await processIntakeText(currentState, transcriptChunkText, speaker, "process-chunk");
  return NextResponse.json(result);
}
