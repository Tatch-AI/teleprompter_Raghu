export interface SupplementRuleDefinition {
  id: string;
  formId: string;
  filename: string;
  label: string;
  fieldId: string;
  triggerValue: unknown;
  /**
   * True when the trigger is a direct, unambiguous match (e.g. business type
   * selects exactly one questionnaire). False means the signal is suggestive
   * but hasn't been confirmed with underwriting — surface it with a
   * "needs validation" caveat rather than as a settled fact.
   */
  validated: boolean;
  reason: string;
}

// Deterministic supplement suggestions, same invariant as GARAGE_RISK_RULES:
// only fires when its source field/business type is known at high confidence.
// This intentionally covers only the forms a *current* intake field can
// signal — see AGENTS.md "Supplemental forms — known gaps" for the rest of
// the GARAGE_SUP_* catalog, which needs new intake questions before it can
// be wired up here.
export const GARAGE_SUPPLEMENT_RULES: SupplementRuleDefinition[] = [
  {
    id: "heavy_vehicle",
    formId: "GARAGE_SUP_007",
    filename: "GARAGE_SUP_007_Heavy_Vehicle_Questionnaire.pdf",
    label: "Heavy Vehicle Questionnaire",
    fieldId: "business_type",
    triggerValue: "heavy",
    validated: true,
    reason: "Business type is heavy vehicle sales/service, which the base GARAGE_001 application doesn't cover on its own.",
  },
  {
    id: "towing_operations",
    formId: "GARAGE_SUP_018",
    filename: "GARAGE_SUP_018_Towing_Operations_Questionnaire.pdf",
    label: "Towing Operations Questionnaire",
    fieldId: "business_type",
    triggerValue: "tow",
    validated: true,
    reason: "Business type is towing, which needs its own operations questionnaire.",
  },
  {
    id: "wholesale_dealer",
    formId: "GARAGE_SUP_022",
    filename: "GARAGE_SUP_022_Wholesale_Dealer_Questionnaire.pdf",
    label: "Wholesale Dealer Questionnaire",
    fieldId: "sales_model",
    triggerValue: "wholesale",
    validated: true,
    reason: "Sales model is wholesale / dealer-to-dealer, which needs its own questionnaire.",
  },
  {
    id: "lessors_risk",
    formId: "GARAGE_SUP_027",
    filename: "GARAGE_SUP_027_Lessors_Risk_Supplemental_Application.pdf",
    label: "Lessors Risk Supplemental Application",
    fieldId: "loaner_or_rental_vehicles",
    triggerValue: true,
    validated: false,
    reason:
      "They loan, lease, or rent out vehicles. Flagged as Lessors Risk, but confirm with underwriting whether Hired & Non-Owned Auto (GARAGE_SUP_008) applies instead or as well — this trigger hasn't been validated against a real submission yet.",
  },
];

export const SUPPLEMENT_RULE_BY_ID: Record<string, SupplementRuleDefinition> = Object.fromEntries(
  GARAGE_SUPPLEMENT_RULES.map((r) => [r.id, r]),
);
