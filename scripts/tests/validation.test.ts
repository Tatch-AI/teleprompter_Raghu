// Tests the cross-field validation engine (lib/garageValidationRules.ts) —
// specifically the vehicle-type sales-mix group, which per Harper University
// training material must total 100% or the application is an automatic
// underwriter kickback.
//
// Run: npm test

import { createInitialIntakeState } from "../../lib/initialState";
import { recompute } from "../../lib/rules";
import { IntakeState } from "../../lib/types";

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

// Directly stamps a field as `filled` — bypasses extraction so the test is
// about the validation rule, not the extractor.
function withFilledField(state: IntakeState, fieldId: string, value: number): IntakeState {
  return {
    ...state,
    fields: {
      ...state.fields,
      [fieldId]: {
        ...state.fields[fieldId],
        value,
        normalizedValue: value,
        status: "filled",
        confidence: 0.9,
        bestConfidence: 0.9,
        everSeen: true,
        evidence: [],
      },
    },
  };
}

const MIX_FIELDS = [
  "vehicle_mix_private_passenger_pct",
  "vehicle_mix_heavy_commercial_pct",
  "vehicle_mix_motorcycle_other_pct",
] as const;

function withMix(businessType: "dealer", values: [number, number, number]): IntakeState {
  let state: IntakeState = { ...createInitialIntakeState(), businessType };
  MIX_FIELDS.forEach((id, i) => {
    state = withFilledField(state, id, values[i]);
  });
  return recompute(state).state;
}

console.log("\n[1] Group not evaluated until every field in it is answered");
const partial = recompute(withFilledField({ ...createInitialIntakeState(), businessType: "dealer" }, MIX_FIELDS[0], 90)).state;
assert(
  partial.validationIssues.length === 0,
  "no validation issue while 2 of 3 vehicle-mix fields are still missing",
);

console.log("\n[2] Exactly 100% -> no issue");
const exact = withMix("dealer", [90, 8, 2]);
assert(exact.validationIssues.length === 0, "90+8+2=100 raises no validation issue");

console.log("\n[3] Under 100% -> error");
const under = withMix("dealer", [70, 10, 5]);
assert(under.validationIssues.length === 1, `70+10+5=85 raises exactly one issue (got ${under.validationIssues.length})`);
assert(under.validationIssues[0]?.severity === "error", "under-100 issue is severity error");
assert(/85%/.test(under.validationIssues[0]?.message ?? ""), `message reports the actual total (got "${under.validationIssues[0]?.message}")`);

console.log("\n[4] Over 100% -> error");
const over = withMix("dealer", [90, 20, 5]);
assert(over.validationIssues.length === 1, `90+20+5=115 raises exactly one issue (got ${over.validationIssues.length})`);

console.log("\n[5] Only applies to the scoped business type (sales-only dealer)");
const repairState = withFilledField(
  { ...createInitialIntakeState(), businessType: "repair" },
  "vehicle_mix_private_passenger_pct",
  40,
);
assert(
  recompute(repairState).state.validationIssues.length === 0,
  "vehicle-mix group doesn't apply outside the dealer (sales-only) path",
);

console.log("\n[6] Clears once corrected back to 100%");
const fixed = withMix("dealer", [90, 8, 2]);
assert(fixed.validationIssues.length === 0, "re-answering to a valid mix clears the issue (recomputed fresh, not sticky)");

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
