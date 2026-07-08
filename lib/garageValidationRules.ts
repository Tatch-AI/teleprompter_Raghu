import { GarageBusinessType, IntakeState, ValidationIssue } from "./types";
import { FIELD_BY_ID } from "./garageFieldDefinitions";

// Cross-field validation, distinct from a single field's status/confidence.
// A field can be individually `filled` and still be wrong once checked against
// its group — a vehicle-mix percentage that's filled but the group doesn't sum
// to 100 is exactly this. Same invariant as risk/supplement rules: only fires
// on real (non-missing) values, never on a half-heard extraction.
export interface PercentGroupRule {
  id: string;
  label: string;
  fieldIds: string[];
  businessTypes: GarageBusinessType[] | "everyone";
  tolerance: number;
}

// Sales-only vehicle-type mix (GARAGE_001 Q2): sales percentages across vehicle
// types must total 100%. Per Harper University training material, a mismatch
// here is an automatic underwriter kickback — see garage_auto/training/.
export const GARAGE_PERCENT_GROUPS: PercentGroupRule[] = [
  {
    id: "vehicle_mix_total",
    label: "Vehicle-type sales mix",
    fieldIds: [
      "vehicle_mix_private_passenger_pct",
      "vehicle_mix_heavy_commercial_pct",
      "vehicle_mix_motorcycle_other_pct",
    ],
    businessTypes: ["dealer"],
    tolerance: 0.01,
  },
  {
    id: "sales_channel_mix_total",
    label: "Retail / broker / wholesale sales mix",
    fieldIds: ["sales_channel_retail_pct", "sales_channel_broker_pct", "sales_channel_wholesale_pct"],
    businessTypes: ["dealer"],
    tolerance: 0.01,
  },
];

function groupApplies(rule: PercentGroupRule, businessType: GarageBusinessType | null): boolean {
  if (rule.businessTypes === "everyone") return true;
  if (!businessType) return false;
  if (businessType === "mixed") return true;
  return rule.businessTypes.includes(businessType);
}

function numericValue(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

// Only checks a group once every field in it has moved off `missing` — while
// the rep is still partway through answering, an incomplete sum isn't a
// discrepancy, it's just not done yet. `missing` never counts as an error.
export function detectValidationIssues(state: IntakeState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const rule of GARAGE_PERCENT_GROUPS) {
    if (!groupApplies(rule, state.businessType)) continue;

    const fieldStates = rule.fieldIds.map((id) => state.fields[id]);
    const allAnswered = fieldStates.every((fs) => fs && fs.status !== "missing");
    if (!allAnswered) continue;

    const total = fieldStates.reduce(
      (sum, fs) => sum + numericValue(fs?.normalizedValue ?? fs?.value),
      0,
    );

    if (Math.abs(total - 100) > rule.tolerance) {
      const breakdown = rule.fieldIds
        .map((id) => {
          const fs = state.fields[id];
          const val = fs?.normalizedValue ?? fs?.value;
          return `${FIELD_BY_ID[id]?.label ?? id}: ${val ?? "?"}%`;
        })
        .join(", ");
      issues.push({
        id: `validation-${rule.id}`,
        ruleId: rule.id,
        severity: "error",
        label: rule.label,
        message: `${rule.label} must total 100% — currently ${total.toFixed(0)}% (${breakdown}).`,
        fieldIds: rule.fieldIds,
      });
    }
  }

  return issues;
}
