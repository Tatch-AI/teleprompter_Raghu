import { CoverageLineRecommendation, GarageBusinessType, GarageCoverageLine } from "./types";

// The "three pillars" of garage insurance (Harper University training:
// garage-coverage-three-pillars.md) are separate coverage lines, not one
// undifferentiated policy. Which ones apply is a business-type-driven
// decision, keyed on two questions: does the business hold OTHER people's
// vehicles (custody), and does it own vehicles for sale (inventory)?
//   - garage_liability:        operations — required for any auto business.
//   - garage_keepers:          protects customer vehicles in your custody
//                              (fire/theft/vandalism/on-lot collision).
//   - dealers_physical_damage: protects your own inventory (flood/hail/
//                              fire/theft wiping out the lot) — keyed to
//                              ownership, not custody.
const HOLDS_CUSTOMER_VEHICLES: GarageBusinessType[] = [
  "dealer_plus_repair",
  "repair",
  "body",
  "heavy",
  "tow",
  "parking",
  "car_wash",
  "mixed",
];

const OWNS_INVENTORY: GarageBusinessType[] = ["dealer", "dealer_plus_repair", "mixed"];

const REASONS: Record<GarageCoverageLine, string> = {
  garage_liability:
    "Covers day-to-day operations and operational liability (e.g. an employee test-drive accident) — required for any auto business.",
  garage_keepers:
    "This business holds vehicles it doesn't own (customer cars for service, tow, valet, or storage) — garage keepers covers fire, theft, vandalism, or an on-lot collision while in your custody.",
  dealers_physical_damage:
    "This business owns vehicles for sale — dealers physical damage protects that inventory from flood, hail, fire, or theft.",
};

export function getRecommendedCoverageLines(
  businessType: GarageBusinessType | null,
): CoverageLineRecommendation[] {
  if (!businessType) return [];

  const lines: GarageCoverageLine[] = ["garage_liability"];
  if (HOLDS_CUSTOMER_VEHICLES.includes(businessType)) lines.push("garage_keepers");
  if (OWNS_INVENTORY.includes(businessType)) lines.push("dealers_physical_damage");

  return lines.map((line) => ({ line, reason: REASONS[line] }));
}
