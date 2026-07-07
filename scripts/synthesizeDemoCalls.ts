// Generates two-voice call audio for the scripted demo transcripts using the
// OpenAI TTS API, then stitches each demo into a single mp3 with ffmpeg.
//
// Output lands in public/demo-audio/<id>.mp3. The UI streams that file through
// the *same* DeepgramLiveSource file-replay path used for real recordings, so
// the "Play synthesized call" demo exercises the real ASR pipeline end to end
// (mp3 -> Deepgram -> transcript chunks -> engine) instead of pushing the
// scripted text straight into the engine.
//
// Requires:
//   - OPENAI_API_KEY in .env.local (same key already used for LLM extraction)
//   - ffmpeg on PATH (used to concatenate per-line audio with silence gaps)
//
// Run:
//   npm run synthesize-demo-audio                 # all demos
//   npm run synthesize-demo-audio -- valley_auto   # a single demo by id

import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEMO_TRANSCRIPTS, MockTranscriptChunk } from "../lib/mockTranscript";

const execFileAsync = promisify(execFile);

loadDotEnvLocal();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? "tts-1";
// Two clearly distinguishable OpenAI voices so the ASR diarization has a
// realistic two-party call to work with.
const VOICE_BY_SPEAKER: Record<string, string> = {
  agent: "onyx",
  customer: "shimmer",
};
const DEFAULT_VOICE = "alloy";
const GAP_SECONDS = 0.6;
const SAMPLE_RATE = 24000;

const OUT_DIR = path.join(process.cwd(), "public", "demo-audio");

async function main(): Promise<void> {
  if (!OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is not set. Add it to .env.local (see .env.example) — the " +
        "same key already used for LLM extraction also drives TTS synthesis.",
    );
    process.exit(1);
  }
  await assertFfmpeg();

  const requestedId = process.argv[2];
  const demos = requestedId
    ? DEMO_TRANSCRIPTS.filter((d) => d.id === requestedId)
    : DEMO_TRANSCRIPTS;
  if (demos.length === 0) {
    console.error(`No demo transcript with id "${requestedId}".`);
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  for (const demo of demos) {
    console.log(`\n[${demo.id}] synthesizing ${demo.chunks.length} line(s)...`);
    const tmpDir = path.join(OUT_DIR, `.tmp-${demo.id}`);
    await mkdir(tmpDir, { recursive: true });
    try {
      await synthesizeDemo(demo.id, demo.chunks, tmpDir);
      console.log(`[${demo.id}] wrote public/demo-audio/${demo.id}.mp3`);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }
}

async function synthesizeDemo(
  id: string,
  chunks: MockTranscriptChunk[],
  tmpDir: string,
): Promise<void> {
  const silencePath = path.join(tmpDir, "silence.mp3");
  await makeSilence(silencePath, GAP_SECONDS);

  // Interleave each spoken line with a short silence so turns don't run
  // together, then let ffmpeg's concat *filter* (not the demuxer) join them —
  // the filter re-encodes, so small format differences between the TTS output
  // and the generated silence never cause a broken/truncated file.
  const inputs: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const voice = VOICE_BY_SPEAKER[chunk.speaker] ?? DEFAULT_VOICE;
    const chunkPath = path.join(tmpDir, `line-${String(i).padStart(3, "0")}.mp3`);
    await speak(chunk.text, voice, chunkPath);
    inputs.push(chunkPath);
    if (i < chunks.length - 1) inputs.push(silencePath);
  }

  const outFile = path.join(OUT_DIR, `${id}.mp3`);
  const args: string[] = ["-y"];
  for (const f of inputs) args.push("-i", f);
  const filterInputs = inputs.map((_, i) => `[${i}:a]`).join("");
  const filter = `${filterInputs}concat=n=${inputs.length}:v=0:a=1[out]`;
  args.push(
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-ar",
    String(SAMPLE_RATE),
    "-ac",
    "1",
    "-c:a",
    "libmp3lame",
    outFile,
  );
  await execFileAsync("ffmpeg", args);
}

async function speak(text: string, voice: string, outPath: string): Promise<void> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: TTS_MODEL, voice, input: text, response_format: "mp3" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TTS request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
}

async function makeSilence(outPath: string, seconds: number): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=${SAMPLE_RATE}:cl=mono`,
    "-t",
    String(seconds),
    "-q:a",
    "9",
    outPath,
  ]);
}

async function assertFfmpeg(): Promise<void> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
  } catch {
    console.error(
      "ffmpeg not found on PATH. Install it (e.g. `brew install ffmpeg`) to stitch the synthesized lines together.",
    );
    process.exit(1);
  }
}

// Minimal .env.local loader so this script works the same way whether it's
// run standalone or alongside `next dev` (which loads .env.local itself).
// Values already present in process.env win.
function loadDotEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
