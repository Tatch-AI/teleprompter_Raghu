// Automated engine test for the Dexter's Auto (real call) demo.
//
// This runs the deterministic mock extractor + the deterministic engine over the
// scripted Dexter's Auto chunks (no server, no LLM key) and asserts:
//   1. the extracted application record matches the known Dexter's Auto facts,
//   2. the two real-call conflicts are raised (revenue, dealer plates),
//   3. the self-repossession-without-BHPH specialty flag fires,
//   4. the pre-emptive "Ask Next" teleprompt follows the documented priority order.
//
// Run: npm test

import { createInitialIntakeState } from "../../lib/initialState";
import { mockExtract } from "../../lib/llmExtraction";
import { processExtraction, resolveConflict } from "../../lib/rules";
import { DEXTERS_AUTO_CHUNKS } from "../../lib/mockTranscript";
import { IntakeState, NextBestQuestion } from "../../lib/types";

let failures = 0;
let checks = 0;

function assert(cond: boolean, message: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  ✗ ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function fieldValue(state: IntakeState, id: string): unknown {
  return state.fields[id]?.normalizedValue ?? state.fields[id]?.value ?? null;
}

function fieldStatus(state: IntakeState, id: string): string {
  return state.fields[id]?.status ?? "missing";
}

// --- Play the whole scripted call through extractor + engine ---------------
let state = createInitialIntakeState();
let lastQuestion: NextBestQuestion | null = null;

for (const chunk of DEXTERS_AUTO_CHUNKS) {
  const extraction = mockExtract(state, chunk.text);
  const result = processExtraction(state, extraction, {
    id: `chunk-${state.transcriptChunks.length}`,
    text: chunk.text,
    speaker: chunk.speaker,
    createdAt: new Date().toISOString(),
  });
  state = result.state;
  lastQuestion = result.nextBestQuestion;
}

console.log("\n[1] Extracted application record matches Dexter's Auto facts");
assert(state.businessType === "dealer", `business type is dealer (got ${state.businessType})`);
assert(fieldValue(state, "legal_name") === "Dexter's Auto LLC", `legal name is Dexter's Auto LLC (got ${fieldValue(state, "legal_name")})`);
assert(fieldValue(state, "entity_type") === "LLC", `entity type is LLC (got ${fieldValue(state, "entity_type")})`);
assert(fieldValue(state, "years_in_business") === 8, `years in business is 8 (got ${fieldValue(state, "years_in_business")})`);
assert(fieldValue(state, "sales_model") === "retail", `sales model is retail (got ${fieldValue(state, "sales_model")})`);
assert(fieldValue(state, "vehicles_sold_per_year") === 10, `vehicles sold per year is 10 (got ${fieldValue(state, "vehicles_sold_per_year")})`);
assert(fieldValue(state, "buy_here_pay_here") === false, `buy-here-pay-here is false (got ${fieldValue(state, "buy_here_pay_here")})`);
assert(fieldValue(state, "self_repossession") === true, `self repossession is true (got ${fieldValue(state, "self_repossession")})`);
assert(fieldValue(state, "titles_transfer_promptly") === true, `titles transfer promptly is true (got ${fieldValue(state, "titles_transfer_promptly")})`);
assert(fieldValue(state, "test_drives_allowed") === true, `test drives allowed is true`);
assert(fieldValue(state, "test_drive_license_check") === true, `license checked before test drive is true`);
assert(fieldValue(state, "test_drive_ride_along") === true, `ride-along on test drive is true`);
assert(fieldValue(state, "overnight_test_drives") === false, `overnight test drives is false`);
assert(fieldValue(state, "rideshare_use_owned_autos") === false, `rideshare use is false`);
assert(fieldValue(state, "plates_loaned_or_rented") === false, `plates loaned/rented is false`);
assert(String(fieldValue(state, "lot_security")).includes("open"), `lot security notes open lot (got ${fieldValue(state, "lot_security")})`);
assert(String(fieldValue(state, "keys_handling")).toLowerCase().includes("office"), `keys handled in office (got ${fieldValue(state, "keys_handling")})`);
assert(String(fieldValue(state, "desired_liability_limits")).includes("75"), `liability limit captures 75k state minimum (got ${fieldValue(state, "desired_liability_limits")})`);

console.log("\n[2] Real-call conflicts are raised (never auto-discarded)");
const revConflict = state.conflicts.find((c) => c.fieldId === "sales_revenue");
const plateConflict = state.conflicts.find((c) => c.fieldId === "dealer_plate_count");
assert(!!revConflict, "revenue conflict raised ($35 vs $35,000)");
assert(fieldStatus(state, "sales_revenue") === "conflict", "sales_revenue is in conflict status");
assert(!!plateConflict, "dealer plate conflict raised (two vs three)");
assert(fieldStatus(state, "dealer_plate_count") === "conflict", "dealer_plate_count is in conflict status");

console.log("\n[3] Self-repossession specialty flag fires");
const specialtyFlag = state.riskFlags.find((f) => f.ruleId === "self_repo_without_bhph" && f.detected);
assert(!!specialtyFlag, "self_repo_without_bhph specialty flag detected (repos vehicles but no BHPH)");

console.log("\n[4] Ask Next follows priority order");
// With unresolved conflicts present, the teleprompt must surface conflict resolution first.
assert(lastQuestion?.category === "conflict_resolution", `while conflicts open, Ask Next = conflict_resolution (got ${lastQuestion?.category})`);
assert(
  lastQuestion?.fieldIds?.includes("sales_revenue") === true,
  `conflict prompt targets the lowest-priority conflicting field, sales_revenue (got ${lastQuestion?.fieldIds?.join(",")})`,
);

// Resolve both conflicts the way the real rep did, then risk should surface.
let resolved = resolveConflict(state, "sales_revenue", "new").state;
const revenueAfter = resolved.fields["sales_revenue"]?.normalizedValue;
assert(revenueAfter === 35000, `resolving revenue to new value gives 35,000 (got ${revenueAfter})`);
const afterPlates = resolveConflict(resolved, "dealer_plate_count", "new");
resolved = afterPlates.state;
assert(resolved.fields["dealer_plate_count"]?.normalizedValue === 3, `resolving plates to new value gives 3`);

const nextAfterResolution = afterPlates.nextBestQuestion;
assert(
  nextAfterResolution.category === "risk_followup" || nextAfterResolution.category === "talk_track_missing_field",
  `after conflicts clear, Ask Next moves to risk or next missing field (got ${nextAfterResolution.category})`,
);

// --- Summary ---------------------------------------------------------------
console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
