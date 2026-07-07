// Tests the "three pillars" coverage-line recommendation (garage liability /
// garage keepers / dealers physical damage) against the business-type rules
// from garage-coverage-three-pillars.md: a repair shop needs liability +
// keepers only (no inventory); a franchise-style dealer_plus_repair needs all
// three; a pure dealer needs liability + physical damage but not keepers
// (no customer vehicles in its custody).
//
// Run: npm test

import { getRecommendedCoverageLines } from "../../lib/garageCoverageRules";
import { createInitialIntakeState } from "../../lib/initialState";
import { recompute } from "../../lib/rules";
import { GarageBusinessType, GarageCoverageLine } from "../../lib/types";

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

function lines(businessType: GarageBusinessType | null): GarageCoverageLine[] {
  return getRecommendedCoverageLines(businessType).map((c) => c.line);
}

console.log("\n[1] Unknown business type recommends nothing yet");
assert(lines(null).length === 0, "no business type -> no coverage-line recommendations");

console.log("\n[2] Repair shop: liability + keepers, no inventory line");
const repair = lines("repair");
assert(repair.includes("garage_liability"), "repair includes garage_liability");
assert(repair.includes("garage_keepers"), "repair includes garage_keepers (holds customer cars)");
assert(!repair.includes("dealers_physical_damage"), "repair excludes dealers_physical_damage (no inventory)");

console.log("\n[3] Pure dealer: liability + physical damage, no keepers");
const dealer = lines("dealer");
assert(dealer.includes("garage_liability"), "dealer includes garage_liability");
assert(dealer.includes("dealers_physical_damage"), "dealer includes dealers_physical_damage (owns inventory)");
assert(!dealer.includes("garage_keepers"), "dealer excludes garage_keepers (no customer-vehicle custody)");

console.log("\n[4] Dealer + repair (franchise-style): all three pillars");
const dealerPlusRepair = lines("dealer_plus_repair");
assert(dealerPlusRepair.length === 3, `dealer_plus_repair recommends all 3 pillars (got ${dealerPlusRepair.length})`);
for (const line of ["garage_liability", "garage_keepers", "dealers_physical_damage"] as GarageCoverageLine[]) {
  assert(dealerPlusRepair.includes(line), `dealer_plus_repair includes ${line}`);
}

console.log("\n[5] Tow: liability + keepers (custody of towed vehicles), no owned inventory");
const tow = lines("tow");
assert(tow.includes("garage_keepers"), "tow includes garage_keepers");
assert(!tow.includes("dealers_physical_damage"), "tow excludes dealers_physical_damage");

console.log("\n[6] Wired into the live engine state via recompute()");
let state = createInitialIntakeState();
assert(state.recommendedCoverageLines.length === 0, "initial state has no coverage-line recommendations");
state = { ...state, businessType: "dealer" };
const { state: recomputed } = recompute(state);
assert(
  recomputed.recommendedCoverageLines.map((c) => c.line).includes("dealers_physical_damage"),
  "recompute() populates recommendedCoverageLines once business type is known",
);

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
