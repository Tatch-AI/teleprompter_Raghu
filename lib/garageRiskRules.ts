import { RiskFlag } from "./types";

export interface RiskRuleDefinition {
  id: string;
  label: string;
  severity: RiskFlag["severity"];
  fieldId: string;
  /** Simple rules fire when the field's normalized value equals triggerValue. */
  triggerValue?: unknown;
  /** Cross-field rules fire from custom logic in the engine. */
  crossField?: boolean;
  recommendedAction: string;
  reason: string;
}

// Deterministic underwriting rules. A knockout/appetite flag only fires when its
// source field is FILLED (high confidence) — never on a half-heard extraction.
export const GARAGE_RISK_RULES: RiskRuleDefinition[] = [
  {
    id: "plates_loaned_or_rented",
    label: "Dealer plates leased, rented, or loaned out",
    severity: "knockout",
    fieldId: "plates_loaned_or_rented",
    triggerValue: true,
    recommendedAction:
      "Confirm whether dealer plates ever leave the business's control. If yes, flag as likely decline or specialty placement.",
    reason: "Markets almost always decline when plates leave the dealer's control.",
  },
  {
    id: "buy_here_pay_here",
    label: "Buy-here-pay-here financing",
    severity: "appetite",
    fieldId: "buy_here_pay_here",
    triggerValue: true,
    recommendedAction: "Confirm title transfers to the buyer with the dealer as lienholder.",
    reason: "Carrying the paper adds collections and repossession exposure.",
  },
  {
    id: "self_repossession",
    label: "Self repossession",
    severity: "appetite",
    fieldId: "self_repossession",
    triggerValue: true,
    recommendedAction:
      "Confirm whether repossession is tied to buy-here-pay-here financing and flag for underwriting.",
    reason: "Self-repossession is higher-risk work and may need a different market.",
  },
  {
    id: "self_repo_without_bhph",
    label: "Self repossession without buy-here-pay-here (inconsistent)",
    severity: "specialty_market",
    fieldId: "self_repossession",
    crossField: true,
    recommendedAction:
      "Reconcile: they repossess vehicles but don't carry the paper. Clarify who they repossess for; likely a specialty exposure.",
    reason:
      "Repossessing vehicles you didn't finance is inconsistent and points to an unlicensed-repo / specialty exposure.",
  },
  {
    id: "test_drive_no_license_check",
    label: "No license check before test drive",
    severity: "knockout",
    fieldId: "test_drive_license_check",
    triggerValue: false,
    recommendedAction:
      "Ask whether they can commit to checking licenses before every test drive going forward.",
    reason: "No license check is a near-universal decline.",
  },
  {
    id: "test_drive_no_ride_along",
    label: "No ride-along during test drive",
    severity: "knockout",
    fieldId: "test_drive_ride_along",
    triggerValue: false,
    recommendedAction:
      "Ask whether they can commit to having an employee ride along (or GPS-tracking) for every test drive.",
    reason: "No ride-along is a near-universal decline.",
  },
  {
    id: "overnight_test_drives",
    label: "Overnight or extended test drives",
    // Corrected during review: real track treats this as near-decline/refer, not a hard stop.
    severity: "appetite",
    fieldId: "overnight_test_drives",
    triggerValue: true,
    recommendedAction:
      "Ask whether overnight or extended test drives can be stopped going forward; frame carefully for the market.",
    reason: "Cars out overnight are a large exposure and a near-decline for many markets.",
  },
  {
    id: "loaner_or_rental_vehicles",
    label: "Loaner or rental vehicles",
    severity: "knockout",
    fieldId: "loaner_or_rental_vehicles",
    triggerValue: true,
    recommendedAction:
      "Flag for specialty market or ask whether loaner/rental exposure can be stopped.",
    reason: "Loaners and rentals are a flat decline for most garage risks.",
  },
  {
    id: "rideshare_use_owned_autos",
    label: "Rideshare use of owned autos",
    severity: "knockout",
    fieldId: "rideshare_use_owned_autos",
    triggerValue: true,
    recommendedAction: "Confirm and stop rideshare use of owned autos; it is a flat decline.",
    reason: "Rideshare use of owned autos is excluded and a flat decline.",
  },
  {
    id: "keys_left_in_vehicle",
    label: "Keys left in / on the vehicle or a vehicle-mounted lockbox",
    severity: "appetite",
    fieldId: "keys_handling",
    crossField: true,
    recommendedAction:
      "Steer toward a key cabinet in the office or keys taken home; keys in the vehicle is a placement problem.",
    reason: "Keys in the vehicle or a vehicle-mounted lockbox is a theft problem markets may not accept.",
  },
  {
    id: "titles_not_transferred_promptly",
    label: "Titles not transferred promptly",
    severity: "knockout",
    fieldId: "titles_transfer_promptly",
    triggerValue: false,
    recommendedAction: "Confirm whether titles can transfer promptly on every sale going forward.",
    reason: "Carriers will not write against state title-transfer non-compliance.",
  },
  {
    id: "dealer_license_required",
    label: "No dealer's license",
    severity: "knockout",
    fieldId: "dealer_license",
    triggerValue: false,
    recommendedAction:
      "Confirm whether the license is truly absent or just pending — capture the pending stage and expected date if so.",
    reason: "Carriers can't insure an unlicensed dealer.",
  },
  {
    id: "min_vehicles_sold",
    label: "Under 15 vehicles sold per year",
    severity: "knockout",
    fieldId: "vehicles_sold_per_year",
    crossField: true,
    recommendedAction: "Confirm the annual volume — under 15/year is treated as hobbyist exposure by most markets.",
    reason: "Carriers treat under-15-per-year sellers as hobbyists and typically won't write them.",
  },
  {
    id: "min_owner_experience",
    label: "Under 3 years of owner experience",
    severity: "knockout",
    fieldId: "owner_experience_years",
    crossField: true,
    recommendedAction: "Confirm the owner's actual industry experience — most carriers won't write under 3 years.",
    reason: "Most carriers will not write inexperienced operators.",
  },
  {
    id: "plate_to_driver_ratio",
    label: "Too many dealer plates per named driver",
    severity: "knockout",
    fieldId: "dealer_plate_count",
    crossField: true,
    recommendedAction: "Verify the plate count, or add the additional named drivers/owners who use them.",
    reason: "More than 3 dealer plates per named driver/owner typically blocks placement.",
  },
];

export const RISK_RULE_BY_ID: Record<string, RiskRuleDefinition> = Object.fromEntries(
  GARAGE_RISK_RULES.map((r) => [r.id, r]),
);
