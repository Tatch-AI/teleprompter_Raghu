// Reads the two append-only logs the app writes during real/demo calls —
// data/feedback.jsonl (rep corrections) and data/extraction_events.jsonl
// (every extraction candidate, not just what survived) — and reports the
// numbers the earlier design discussion flagged as missing: confidence
// calibration, per-field correction rate, and llm vs mock extractor quality.
//
// Run: npm run analyze-accuracy

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ExtractionEvent, FeedbackEvent } from "../lib/types";

const DATA_DIR = path.join(process.cwd(), "data");

async function readJsonl<T>(filename: string): Promise<T[]> {
  try {
    const raw = await readFile(path.join(DATA_DIR, filename), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as T;
        } catch {
          return null;
        }
      })
      .filter((v): v is T => v !== null);
  } catch {
    return [];
  }
}

const CONFIDENCE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "0.00–0.55 (below review threshold)", min: 0, max: 0.55 },
  { label: "0.55–0.70 (needs review)", min: 0.55, max: 0.7 },
  { label: "0.70–0.85 (needs review, high end)", min: 0.7, max: 0.85 },
  { label: "0.85–1.00 (auto-filled)", min: 0.85, max: 1.001 },
];

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

function calibrationTable(events: FeedbackEvent[], label: string): void {
  console.log(`\n  Calibration — ${label} (machine confidence vs. correction rate)`);
  console.log(`  ${"bucket".padEnd(36)} ${"n".padStart(5)} ${"changed".padStart(9)} ${"rate".padStart(8)}`);
  if (events.length === 0) {
    console.log("    (no events in this slice)");
    return;
  }
  for (const bucket of CONFIDENCE_BUCKETS) {
    const inBucket = events.filter((e) => e.machineConfidence >= bucket.min && e.machineConfidence < bucket.max);
    const changed = inBucket.filter((e) => e.changed).length;
    console.log(
      `  ${bucket.label.padEnd(36)} ${String(inBucket.length).padStart(5)} ${String(changed).padStart(9)} ${pct(changed, inBucket.length).padStart(8)}`,
    );
  }
  console.log(
    "  (higher confidence should mean lower correction rate — a flat or inverted curve means confidence isn't calibrated yet)",
  );
}

async function main() {
  const [feedback, extractions] = await Promise.all([
    readJsonl<FeedbackEvent>("feedback.jsonl"),
    readJsonl<ExtractionEvent>("extraction_events.jsonl"),
  ]);

  console.log("=== Garage Intake Copilot — accuracy report ===");

  if (feedback.length === 0 && extractions.length === 0) {
    console.log(
      "\nNo data yet. Run a demo/live call and confirm, edit, or resolve a few fields, then re-run this script.",
    );
    return;
  }

  // --- Feedback summary -----------------------------------------------------
  const corrections = feedback.filter((e) => e.changed);
  console.log(`\nFeedback events: ${feedback.length} total, ${corrections.length} corrections (${pct(corrections.length, feedback.length)})`);

  const byMode = new Map<string, FeedbackEvent[]>();
  for (const e of feedback) {
    const key = e.extractorMode ?? "unknown";
    byMode.set(key, [...(byMode.get(key) ?? []), e]);
  }
  for (const [mode, events] of byMode) {
    const changed = events.filter((e) => e.changed).length;
    console.log(`  extractorMode=${mode}: ${events.length} events, ${changed} corrections (${pct(changed, events.length)})`);
  }

  // Calibration only makes sense split by extractor — mock "confidence" is a
  // hand-set regex heuristic, not a calibrated probability like the LLM's.
  calibrationTable(feedback.filter((e) => e.extractorMode === "llm"), "llm extractor only");
  calibrationTable(feedback.filter((e) => e.extractorMode === "mock"), "mock extractor only (heuristic, not a real probability)");

  // --- Per-field correction rate ---------------------------------------------
  const byField = new Map<string, FeedbackEvent[]>();
  for (const e of feedback) {
    byField.set(e.fieldId, [...(byField.get(e.fieldId) ?? []), e]);
  }
  const fieldRates = [...byField.entries()]
    .map(([fieldId, events]) => ({
      fieldId,
      label: events[0]?.fieldLabel ?? fieldId,
      n: events.length,
      changed: events.filter((e) => e.changed).length,
    }))
    .sort((a, b) => b.changed / b.n - a.changed / a.n);

  console.log("\nPer-field correction rate (worst first):");
  console.log(`  ${"field".padEnd(34)} ${"n".padStart(4)} ${"changed".padStart(9)} ${"rate".padStart(8)}`);
  for (const f of fieldRates) {
    console.log(`  ${f.label.padEnd(34)} ${String(f.n).padStart(4)} ${String(f.changed).padStart(9)} ${pct(f.changed, f.n).padStart(8)}`);
  }

  // --- Extraction volume (raw candidates, not just the ones a rep touched) --
  if (extractions.length > 0) {
    console.log(`\nExtraction events logged: ${extractions.length}`);
    const extByMode = new Map<string, ExtractionEvent[]>();
    for (const e of extractions) {
      extByMode.set(e.extractorMode, [...(extByMode.get(e.extractorMode) ?? []), e]);
    }
    for (const [mode, events] of extByMode) {
      const avgConf = events.reduce((sum, e) => sum + e.confidence, 0) / events.length;
      console.log(`  extractorMode=${mode}: ${events.length} candidates, avg confidence ${(avgConf * 100).toFixed(1)}%`);
    }

    // Fields extracted more than once for the same intake got re-mentioned or
    // contradicted — a proxy for which questions produce ambiguous answers.
    const perIntakeField = new Map<string, number>();
    for (const e of extractions) {
      const key = `${e.intakeId}::${e.fieldId}`;
      perIntakeField.set(key, (perIntakeField.get(key) ?? 0) + 1);
    }
    const reExtracted = [...perIntakeField.entries()].filter(([, count]) => count > 1);
    console.log(
      `\nFields re-extracted more than once within the same call: ${reExtracted.length} (${pct(reExtracted.length, perIntakeField.size)} of all field/intake pairs) — candidates for talk-track wording review.`,
    );
  } else {
    console.log("\nNo extraction_events.jsonl data yet (only calls run after this feature was added will log here).");
  }
}

main();
