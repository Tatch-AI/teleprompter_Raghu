// Tests the rules sourced from the real Harper Colony Garage Application
// (Sales-Only Intake, GAR-APP121-0525): minimum vehicle volume, minimum owner
// experience, prompt title transfer, dealer's license, the plate-to-driver
// ratio, and the retail/broker/wholesale sales-channel mix.
//
// Run: npm test

import { createInitialIntakeState } from "../../lib/initialState";
import { mockExtract } from "../../lib/llmExtraction";
import { processExtraction, recompute } from "../../lib/rules";
import { DEMO_TRANSCRIPTS } from "../../lib/mockTranscript";
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

function hasFlag(state: IntakeState, ruleId: string): boolean {
  return state.riskFlags.some((f) => f.ruleId === ruleId && f.detected);
}

function withFilledField(state: IntakeState, fieldId: string, value: unknown): IntakeState {
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

function withDriverNamed(state: IntakeState, name: string): IntakeState {
  return {
    ...state,
    drivers: [
      {
        id: "driver-1",
        fields: {
          ...createInitialIntakeState().drivers[0]?.fields,
          driver_name: {
            fieldId: "driver_name",
            value: name,
            normalizedValue: name,
            status: "filled",
            confidence: 0.9,
            bestConfidence: 0.9,
            everSeen: true,
            confirmed: false,
            evidence: [],
          },
        },
      },
    ],
  };
}

console.log("\n[1] Minimum 15 vehicles/year");
let state: IntakeState = { ...createInitialIntakeState(), businessType: "dealer" };
state = recompute(withFilledField(state, "vehicles_sold_per_year", 10)).state;
assert(hasFlag(state, "min_vehicles_sold"), "10/year fires the knockout");
state = recompute(withFilledField(state, "vehicles_sold_per_year", 20)).state;
assert(!hasFlag(state, "min_vehicles_sold"), "20/year clears it (recomputed fresh)");

console.log("\n[2] Minimum 3 years owner experience");
state = { ...createInitialIntakeState(), businessType: "dealer" };
state = recompute(withFilledField(state, "owner_experience_years", 1)).state;
assert(hasFlag(state, "min_owner_experience"), "1 year of experience fires the knockout");
const noExp = recompute({ ...createInitialIntakeState(), businessType: "dealer" }).state;
assert(!hasFlag(noExp, "min_owner_experience"), "missing (never mentioned) never fires — only filled values do");

console.log("\n[3] Titles not transferred promptly");
state = { ...createInitialIntakeState(), businessType: "dealer" };
state = recompute(withFilledField(state, "titles_transfer_promptly", false)).state;
assert(hasFlag(state, "titles_not_transferred_promptly"), "false fires the knockout");
state = recompute(withFilledField(state, "titles_transfer_promptly", true)).state;
assert(!hasFlag(state, "titles_not_transferred_promptly"), "true doesn't fire");

const titlesNaturalPhrasing = mockExtract(
  createInitialIntakeState(),
  "Titles don't transfer promptly.",
);
assert(
  titlesNaturalPhrasing.extractedFields.find((f) => f.fieldId === "titles_transfer_promptly")?.value === false,
  "natural phrasing ('titles don't transfer promptly', not just 'titles transfer... not promptly') extracts correctly",
);

console.log("\n[4] Dealer's license required");
state = { ...createInitialIntakeState(), businessType: "dealer" };
state = recompute(withFilledField(state, "dealer_license", false)).state;
assert(hasFlag(state, "dealer_license_required"), "no license fires the knockout");
state = recompute(withFilledField(state, "dealer_license", true)).state;
assert(!hasFlag(state, "dealer_license_required"), "has license clears it");

console.log("\n[5] Plate-to-driver ratio (max 3 per named driver)");
state = { ...createInitialIntakeState(), businessType: "dealer" };
state = withFilledField(state, "dealer_plate_count", 4);
state = withDriverNamed(state, "Maria Lopez");
state = recompute(state).state;
assert(hasFlag(state, "plate_to_driver_ratio"), "4 plates / 1 named driver (>3) fires the knockout");

let healthy: IntakeState = { ...createInitialIntakeState(), businessType: "dealer" };
healthy = withFilledField(healthy, "dealer_plate_count", 3);
healthy = withDriverNamed(healthy, "Maria Lopez");
healthy = recompute(healthy).state;
assert(!hasFlag(healthy, "plate_to_driver_ratio"), "3 plates / 1 named driver (=3) does not fire");

const zeroDrivers = recompute(withFilledField({ ...createInitialIntakeState(), businessType: "dealer" }, "dealer_plate_count", 10)).state;
assert(
  !hasFlag(zeroDrivers, "plate_to_driver_ratio"),
  "zero named drivers doesn't fire this rule — that's no_complete_driver's job, not a divide-by-zero guess",
);

console.log("\n[6] Sales-channel mix (retail/broker/wholesale) must total 100%");
function withChannelMix(retail: number, broker: number, wholesale: number): IntakeState {
  let s: IntakeState = { ...createInitialIntakeState(), businessType: "dealer" };
  s = withFilledField(s, "sales_channel_retail_pct", retail);
  s = withFilledField(s, "sales_channel_broker_pct", broker);
  s = withFilledField(s, "sales_channel_wholesale_pct", wholesale);
  return recompute(s).state;
}
const exact = withChannelMix(70, 20, 10);
assert(exact.validationIssues.length === 0, "70+20+10=100 raises no validation issue");
const under = withChannelMix(50, 10, 10);
assert(
  under.validationIssues.some((v) => v.ruleId === "sales_channel_mix_total"),
  "50+10+10=70 raises the sales-channel validation issue",
);

console.log("\n[7] End-to-end against the real demo scripts");
function runDemo(demoId: string): IntakeState {
  const demo = DEMO_TRANSCRIPTS.find((d) => d.id === demoId)!;
  let s = createInitialIntakeState();
  for (const chunk of demo.chunks) {
    const extraction = mockExtract(s, chunk.text);
    const result = processExtraction(s, extraction, {
      id: `c-${s.transcriptChunks.length}`,
      text: chunk.text,
      speaker: chunk.speaker,
      createdAt: new Date().toISOString(),
    });
    s = result.state;
  }
  return s;
}
const dextersAuto = runDemo("dexters_auto");
assert(hasFlag(dextersAuto, "min_vehicles_sold"), "Dexter's Auto (10/year) fires min_vehicles_sold live");
assert(
  dextersAuto.fields.sales_channel_retail_pct?.value === 100,
  `Dexter's "100% retail to the public" extracts sales_channel_retail_pct=100 (got ${dextersAuto.fields.sales_channel_retail_pct?.value})`,
);
const valleyAuto = runDemo("valley_auto");
assert(
  !hasFlag(valleyAuto, "plate_to_driver_ratio"),
  "Valley Auto's plate-to-driver ratio doesn't fire while the plate count is still an unresolved conflict",
);

console.log("\n[8] A pending dealer's license is a Yes, not a No (per the doc, carriers will quote it)");
const pending = mockExtract(createInitialIntakeState(), "My dealer's license is pending in NC, should issue within 30 days.");
const pendingField = pending.extractedFields.find((f) => f.fieldId === "dealer_license");
assert(pendingField?.value === true, `pending license extracts as true (got ${pendingField?.value})`);

console.log("\n[9] Wholesale/broker % alone triggers the Wholesale Dealer Questionnaire");
let wholesaleState: IntakeState = { ...createInitialIntakeState(), businessType: "dealer" };
wholesaleState = withFilledField(wholesaleState, "sales_channel_wholesale_pct", 15);
wholesaleState = recompute(wholesaleState).state;
assert(
  wholesaleState.suggestedSupplements.some((s) => s.ruleId === "wholesale_or_broker_pct"),
  "15% wholesale share suggests the Wholesale Dealer Questionnaire even without sales_model='wholesale'",
);
const noDoubleSuggestion = wholesaleState.suggestedSupplements.filter((s) => s.formId === "GARAGE_SUP_022");
assert(noDoubleSuggestion.length === 1, `exactly one suggestion card for GARAGE_SUP_022, not two (got ${noDoubleSuggestion.length})`);

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
