// Quantitative field-accuracy scoring: replays a scripted demo call through
// the mock extractor + deterministic engine and scores the final field state
// against a hand-authored answer key.
//
// Modeled on the same idea as Tatch-AI/david-lingan-superday-intake's
// compare_suggestions.py (an answer-key + exact-match scorer) — but this is
// our own implementation and our own independently-authored answer keys, not
// theirs. Ours also cover multiple business-type paths (not just sales-only
// dealer) and score against our semantic fieldIds rather than raw PDF fields.
//
// Distinct from `npm run analyze-accuracy`, which mines *live* feedback/
// extraction logs for confidence calibration — this script has no dependency
// on prior runtime data; it's a repeatable regression check against known
// ground truth, safe to run in CI.
//
// Run: npm run eval-accuracy [callId ...]   (defaults to every answer key on disk)

import fs from "node:fs";
import path from "node:path";
import { createInitialIntakeState } from "../lib/initialState";
import { mockExtract } from "../lib/llmExtraction";
import { processExtraction } from "../lib/rules";
import { FIELD_BY_ID } from "../lib/garageFieldDefinitions";
import { DEMO_TRANSCRIPTS } from "../lib/mockTranscript";
import { IntakeState } from "../lib/types";

const ANSWER_KEYS_DIR = path.join(process.cwd(), "scripts", "answerKeys");

interface AnswerKey {
  call: string;
  description: string;
  notes?: string;
  fields: Record<string, unknown>;
}

interface ScoreRow {
  fieldId: string;
  expected: unknown;
  actual: unknown;
  status: "match" | "mismatch" | "missing";
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[$,]/g, "")
    .replace(/\s+/g, " ")
    .replace(/%$/, "");
}

// Structured types (number/currency/boolean/enum) must match exactly after
// normalization. Free-text "string" fields (narrative or descriptive, e.g.
// lot_security, keys_handling) use substring containment in either direction
// — exact-string equality on full-sentence extractor output isn't a
// meaningful signal, but "does the extracted text actually say what the
// answer key expects" is.
function fieldMatches(fieldId: string, expected: unknown, actual: unknown): boolean {
  const type = FIELD_BY_ID[fieldId]?.type;
  const normExpected = normalize(expected);
  const normActual = normalize(actual);
  if (type === "string") {
    if (!normExpected) return !normActual;
    return normActual.includes(normExpected) || normExpected.includes(normActual);
  }
  return normExpected === normActual;
}

function runCall(callId: string): IntakeState {
  const demo = DEMO_TRANSCRIPTS.find((d) => d.id === callId);
  if (!demo) {
    throw new Error(`No scripted demo transcript named "${callId}" in lib/mockTranscript.ts`);
  }
  let state = createInitialIntakeState();
  for (const chunk of demo.chunks) {
    const extraction = mockExtract(state, chunk.text);
    const result = processExtraction(state, extraction, {
      id: `chunk-${state.transcriptChunks.length}`,
      text: chunk.text,
      speaker: chunk.speaker,
      createdAt: new Date().toISOString(),
    });
    state = result.state;
  }
  return state;
}

function scoreCall(callId: string): { rows: ScoreRow[]; accuracy: number } {
  const answerKeyPath = path.join(ANSWER_KEYS_DIR, `${callId}.json`);
  const answerKey = JSON.parse(fs.readFileSync(answerKeyPath, "utf-8")) as AnswerKey;
  const state = runCall(callId);

  const rows: ScoreRow[] = [];
  for (const [fieldId, expected] of Object.entries(answerKey.fields)) {
    const fs2 = state.fields[fieldId];
    if (!fs2 || fs2.status === "missing") {
      rows.push({ fieldId, expected, actual: null, status: "missing" });
      continue;
    }
    const actual = fs2.normalizedValue ?? fs2.value;
    rows.push({
      fieldId,
      expected,
      actual,
      status: fieldMatches(fieldId, expected, actual) ? "match" : "mismatch",
    });
  }

  const matched = rows.filter((r) => r.status === "match").length;
  const accuracy = rows.length ? matched / rows.length : 0;

  console.log(`\n=== ${callId} — ${answerKey.description} ===`);
  if (answerKey.notes) console.log(`  (${answerKey.notes})`);
  for (const row of rows) {
    const mark = row.status === "match" ? "✓" : row.status === "missing" ? "·" : "✗";
    console.log(
      `  ${mark} ${row.fieldId.padEnd(34)} expected=${JSON.stringify(row.expected)} actual=${JSON.stringify(row.actual)}`,
    );
  }
  const mismatched = rows.filter((r) => r.status === "mismatch").length;
  const missing = rows.filter((r) => r.status === "missing").length;
  console.log(
    `Score: ${matched}/${rows.length} (${(accuracy * 100).toFixed(1)}%) — ${mismatched} mismatch, ${missing} missing`,
  );

  return { rows, accuracy };
}

function main() {
  const requested = process.argv.slice(2);
  const callIds =
    requested.length > 0
      ? requested
      : fs
          .readdirSync(ANSWER_KEYS_DIR)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(/\.json$/, ""));

  if (callIds.length === 0) {
    console.log("No answer keys found in scripts/answerKeys/.");
    return;
  }

  const results = callIds.map(scoreCall);
  const overall =
    results.reduce((sum, r) => sum + r.rows.filter((row) => row.status === "match").length, 0) /
    results.reduce((sum, r) => sum + r.rows.length, 0);
  console.log(`\nOverall (mock extractor, ${callIds.length} call(s)): ${(overall * 100).toFixed(1)}%`);
}

main();
