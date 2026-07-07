import { NextResponse } from "next/server";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { FeedbackEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.jsonl");

// Append a correction/acceptance event as one JSON line. This file is the seed
// training set: (machineValue, correctedValue, changed, confidence, evidence).
export async function POST(request: Request) {
  let event: FeedbackEvent;
  try {
    event = (await request.json()) as FeedbackEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!event?.fieldId || !event?.action) {
    return NextResponse.json({ error: "Missing fieldId or action" }, { status: 400 });
  }

  try {
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(FEEDBACK_FILE, `${JSON.stringify(event)}\n`, "utf8");
  } catch (err) {
    return NextResponse.json(
      { error: `Could not persist feedback: ${(err as Error).message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

// Read back recent events (for a dashboard / verification).
export async function GET() {
  try {
    const raw = await readFile(FEEDBACK_FILE, "utf8");
    const events = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return NextResponse.json({ count: events.length, events });
  } catch {
    return NextResponse.json({ count: 0, events: [] });
  }
}
