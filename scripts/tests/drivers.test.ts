// Tests the minimal driver-schedule model (lib/garageDriverFields.ts,
// mergeDriverCandidates in lib/rules.ts) — specifically the "at least one
// complete driver required" knockout rule from Harper University training
// material ("the number one reason submissions fail").
//
// Run: npm test

import { createInitialIntakeState } from "../../lib/initialState";
import { mockExtract } from "../../lib/llmExtraction";
import { mergeDriverCandidates, recompute } from "../../lib/rules";
import { IntakeState, TranscriptChunk } from "../../lib/types";

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

function chunk(id: string, text: string): TranscriptChunk {
  return { id, text, speaker: "customer", createdAt: new Date().toISOString() };
}

function hasKnockout(state: IntakeState): boolean {
  return state.riskFlags.some((f) => f.ruleId === "no_complete_driver" && f.detected);
}

console.log("\n[1] No business type yet -> flag doesn't fire (too early to judge)");
const noBt = recompute(createInitialIntakeState()).state;
assert(!hasKnockout(noBt), "knockout gated behind business type being known");

console.log("\n[2] Business type known, zero drivers -> knockout fires");
const zeroDrivers = recompute({ ...createInitialIntakeState(), businessType: "dealer" }).state;
assert(hasKnockout(zeroDrivers), "no driver at all -> knockout detected");

console.log("\n[3] Partial driver (name only) -> still incomplete, knockout stays");
let state: IntakeState = { ...createInitialIntakeState(), businessType: "dealer" };
state = mergeDriverCandidates(
  state,
  [{ fieldId: "driver_name", value: "Maria Lopez", confidence: 0.9, evidenceQuote: "Maria Lopez", reasoning: "" }],
  chunk("c1", "The driver is Maria Lopez."),
);
state = recompute(state).state;
assert(state.drivers[0]?.fields.driver_name.status === "filled", "driver_name is filled");
assert(hasKnockout(state), "name alone isn't enough — DOB and license still missing");

console.log("\n[4] Full driver (name + DOB + license) -> knockout clears");
state = mergeDriverCandidates(
  state,
  [
    { fieldId: "driver_dob", value: "March 4, 1985", confidence: 0.85, evidenceQuote: "born March 4, 1985", reasoning: "" },
    { fieldId: "driver_license_number", value: "D1234567", confidence: 0.85, evidenceQuote: "license D1234567", reasoning: "" },
  ],
  chunk("c2", "Born March 4, 1985, license D1234567."),
);
state = recompute(state).state;
assert(!hasKnockout(state), "complete driver record clears the knockout");

console.log("\n[5] Conflict on a driver field is raised, not silently overwritten");
state = mergeDriverCandidates(
  state,
  [{ fieldId: "driver_name", value: "Maria Gomez", confidence: 0.9, evidenceQuote: "actually Maria Gomez", reasoning: "" }],
  chunk("c3", "Sorry, actually her name is Maria Gomez."),
);
assert(state.drivers[0]?.fields.driver_name.status === "conflict", "contradictory driver name raises a conflict");
assert(
  state.drivers[0]?.fields.driver_name.value === "Maria Lopez",
  "existing value is preserved until the rep resolves the conflict (never auto-discarded)",
);

console.log("\n[6] End-to-end via the mock extractor on real demo phrasing");
let liveState = createInitialIntakeState();
const extraction = mockExtract(
  liveState,
  "The only driver is Maria Lopez, born March 4, 1985. Her license number is D1234567 from California.",
);
liveState = mergeDriverCandidates(liveState, extraction.driverFields ?? [], chunk("c4", "driver mention"));
assert(liveState.drivers[0]?.fields.driver_name.value === "Maria Lopez", "mock extractor pulls the driver name");
assert(liveState.drivers[0]?.fields.driver_dob.value === "March 4, 1985", "mock extractor pulls the DOB");
assert(liveState.drivers[0]?.fields.driver_license_number.value === "D1234567", "mock extractor pulls the license number");
assert(liveState.drivers[0]?.fields.driver_license_state.value === "California", "mock extractor pulls the license state");

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
