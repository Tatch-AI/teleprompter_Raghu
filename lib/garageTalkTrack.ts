import { GarageBusinessType, TalkTrackStep } from "./types";

export interface GarageTypeOption {
  id: GarageBusinessType;
  label: string;
  shortLabel: string;
}

export const GARAGE_TYPE_OPTIONS: GarageTypeOption[] = [
  { id: "dealer", label: "Used-car / new-car dealer", shortLabel: "Dealer" },
  { id: "dealer_plus_repair", label: "Dealer + repair", shortLabel: "Dealer + repair" },
  { id: "repair", label: "Repair / service shop", shortLabel: "Repair shop" },
  { id: "body", label: "Body / paint shop", shortLabel: "Body shop" },
  { id: "heavy", label: "Heavy-equipment / machinery repair", shortLabel: "Heavy equipment" },
  { id: "tow", label: "Tow / roadside", shortLabel: "Tow" },
  { id: "parking", label: "Parking / storage lot", shortLabel: "Parking" },
  { id: "car_wash", label: "Car wash / detailing", shortLabel: "Car wash" },
  { id: "mixed", label: "Something else / a mix", shortLabel: "Mixed" },
];

// Ordered rep-facing call guide. A step is "satisfied" when every REQUIRED
// mapped field that applies to the selected business type is non-missing
// (narrative fields are done on any non-empty extraction).
export const GARAGE_TALK_TRACK: TalkTrackStep[] = [
  {
    id: "business_type_selector",
    section: "Garage type",
    businessTypes: "everyone",
    question:
      "First, in one line — what's the shop? Are you mainly a dealer selling cars, a repair or body shop, a tow operator, a car wash or detailer, a parking or storage lot, or some mix?",
    whyWeAsk:
      "Garage is several different businesses on one application, so this tells me which questions actually apply.",
    mapsToFields: ["business_type"],
  },
  {
    id: "business_story",
    section: "Warm open",
    businessTypes: "everyone",
    question:
      "Tell me about the operation — what do you do day to day, how long have you been at it, and what's the place like?",
    whyWeAsk:
      "This tells us what kind of operation this is and helps the submission match what underwriters will see.",
    mapsToFields: ["business_story"],
  },
  {
    id: "years_experience",
    section: "Warm open",
    businessTypes: "everyone",
    question:
      "How long have you been in business — and how long have you personally been doing this kind of work?",
    whyWeAsk: "New shops are harder to place; experience is a selling point.",
    mapsToFields: ["years_in_business", "owner_experience_years"],
  },
  {
    id: "legal_name_dba",
    section: "Warm open",
    businessTypes: "everyone",
    question: "What's the legal name, and is there a different name on the sign or website?",
    whyWeAsk:
      "The policy has to be in the exact right name; mismatches can get submissions kicked back.",
    mapsToFields: ["legal_name", "dba_name"],
  },
  {
    id: "entity_type",
    section: "Warm open",
    businessTypes: "everyone",
    question: "Are you an LLC, a corporation, or just you as an individual?",
    whyWeAsk: "The owners and who is covered flow from how the business is set up.",
    mapsToFields: ["entity_type"],
  },
  {
    id: "why_shopping",
    section: "Warm open",
    businessTypes: "everyone",
    question:
      "What's got you shopping coverage right now — just starting up, a contract requiring it, switching carriers, or a renewal coming up?",
    whyWeAsk: "Knowing the reason helps frame the account to the underwriter.",
    mapsToFields: ["why_shopping"],
  },
  {
    id: "sales_model",
    section: "Dealer operations",
    businessTypes: ["dealer", "dealer_plus_repair"],
    question:
      "Are your sales mostly retail to the public, or wholesale / dealer-to-dealer, or do you broker?",
    whyWeAsk: "Retail used-car is the cleanest risk to place; wholesale or broker can change the market.",
    mapsToFields: ["sales_model"],
  },
  {
    id: "vehicles_sold_revenue",
    section: "Dealer operations",
    businessTypes: ["dealer", "dealer_plus_repair"],
    question:
      "Roughly how many vehicles do you sell a year, and what's your split between sales revenue and any service or repair revenue?",
    whyWeAsk: "That is how the policy gets priced and tells the market what size operation this is.",
    mapsToFields: ["vehicles_sold_per_year", "sales_revenue", "service_repair_revenue"],
  },
  {
    id: "dealer_plate_count",
    section: "Dealer operations",
    businessTypes: ["dealer", "dealer_plus_repair"],
    question: "How many dealer plates do you have?",
    whyWeAsk: "Plates drive auto liability exposure and pricing, so the count has to be exact.",
    mapsToFields: ["dealer_plate_count"],
  },
  {
    id: "plates_loaned_or_rented",
    section: "Dealer operations",
    businessTypes: ["dealer", "dealer_plus_repair"],
    question: "Do you ever lease, rent, or loan your plates to anyone?",
    whyWeAsk: "Markets really do not like plates leaving your control, so this should be confirmed.",
    knockout: "Plates leased/rented/loaned out is almost always a decline — confirm it's a No.",
    mapsToFields: ["plates_loaned_or_rented"],
    riskRuleIds: ["plates_loaned_or_rented"],
  },
  {
    id: "buy_here_pay_here",
    section: "Dealer operations",
    businessTypes: ["dealer", "dealer_plus_repair"],
    question:
      "Do you finance your own buyers — buy-here-pay-here — or do they get outside financing?",
    whyWeAsk: "If the dealer carries the paper, it adds collections and repossession exposure.",
    knockout:
      "Buy-here-pay-here is an appetite swinger, not a decline — but title must transfer to the buyer with the dealer as lienholder.",
    mapsToFields: ["buy_here_pay_here"],
    riskRuleIds: ["buy_here_pay_here"],
  },
  {
    id: "titles_transfer_promptly",
    section: "Dealer operations",
    businessTypes: ["dealer", "dealer_plus_repair"],
    question: "Do titles transfer promptly on every sale, in line with your state's rules?",
    whyWeAsk: "Clean title handling avoids E&O and regulatory trouble.",
    mapsToFields: ["titles_transfer_promptly"],
  },
  {
    id: "self_repossession",
    section: "Dealer operations",
    businessTypes: ["dealer", "dealer_plus_repair"],
    question: "Do you ever repossess vehicles yourself?",
    whyWeAsk: "Self-repo is higher-risk work and may need a different market.",
    knockout:
      "Self-repossession with no buy-here-pay-here is inconsistent — if they don't carry the paper, why would they repossess?",
    mapsToFields: ["self_repossession"],
    riskRuleIds: ["self_repossession", "self_repo_without_bhph"],
  },
  {
    id: "test_drive_controls",
    section: "Vehicles & driving",
    businessTypes: ["dealer", "dealer_plus_repair"],
    question:
      "When a customer test-drives, does someone ride along, and do you check their license first?",
    whyWeAsk: "Ride-alongs and license checks reduce theft and accident risk.",
    knockout:
      "No ride-along or no license check is a near-universal decline — these should both be Yes.",
    mapsToFields: ["test_drives_allowed", "test_drive_license_check", "test_drive_ride_along"],
    riskRuleIds: ["test_drive_no_license_check", "test_drive_no_ride_along"],
  },
  {
    id: "overnight_test_drives",
    section: "Vehicles & driving",
    businessTypes: ["dealer", "dealer_plus_repair"],
    question: "Do you ever let a car go overnight or for an extended test drive?",
    whyWeAsk: "Cars out overnight are a big exposure and can be difficult to place.",
    knockout: "Overnight/extended test drives are a near-decline. Get a commitment to stop.",
    mapsToFields: ["overnight_test_drives"],
    riskRuleIds: ["overnight_test_drives"],
  },
  {
    id: "loaner_or_rental_vehicles",
    section: "Vehicles & driving",
    businessTypes: "everyone",
    question: "Do you lease or rent vehicles to anyone, or give out loaner cars?",
    whyWeAsk:
      "Loaners and rentals put vehicles in someone else's hands and are difficult for standard markets.",
    knockout: "Loaner/rental vehicles are a flat decline for most garage risks.",
    mapsToFields: ["loaner_or_rental_vehicles"],
    riskRuleIds: ["loaner_or_rental_vehicles"],
  },
  {
    id: "rideshare_use",
    section: "Vehicles & driving",
    businessTypes: "everyone",
    question: "Are any of the business's vehicles used for Uber, Lyft, or any rideshare?",
    whyWeAsk: "Rideshare isn't ordinary garage exposure and is usually excluded.",
    knockout: "Rideshare use of owned autos is a flat decline — must be No.",
    mapsToFields: ["rideshare_use_owned_autos"],
    riskRuleIds: ["rideshare_use_owned_autos"],
  },
  {
    id: "lot_security",
    section: "Premises",
    businessTypes: "everyone",
    question:
      "Tell me about the lot or premises — how's it secured? Fenced and gated, cameras, in a building, or open lot?",
    whyWeAsk: "Lot security drives whether we can get good coverage on the vehicles in your care.",
    mapsToFields: ["lot_security"],
  },
  {
    id: "keys_handling",
    section: "Premises",
    businessTypes: "everyone",
    question: "How are the keys handled — during business hours and after you close up?",
    whyWeAsk: "Keys left in vehicles or lockboxes are a theft problem markets may not accept.",
    knockout:
      "Keys in/on the vehicle or a vehicle-mounted lockbox is a placement problem — steer to cabinet-in-office or taken-home.",
    mapsToFields: ["keys_handling"],
    riskRuleIds: ["keys_left_in_vehicle"],
  },
  {
    id: "desired_liability_limits",
    section: "Coverages",
    businessTypes: "everyone",
    question: "What liability limits are you carrying now, or do you need for any contract or license?",
    whyWeAsk: "Licenses, leases, or contracts may set minimum limits.",
    mapsToFields: ["desired_liability_limits"],
  },
  {
    id: "current_insurance",
    section: "History",
    businessTypes: "everyone",
    question: "Are you insured right now, and with who? Or is this your first coverage?",
    whyWeAsk: "Prior coverage gives markets confidence; first coverage needs to be explained.",
    mapsToFields: ["current_insurance", "current_carrier"],
  },
  {
    id: "prior_losses",
    section: "History",
    businessTypes: "everyone",
    question: "In the last three years, any claims or losses — even small ones?",
    whyWeAsk: "Loss history affects appetite and pricing.",
    mapsToFields: ["prior_losses"],
  },
  {
    id: "website_or_facebook",
    section: "Online verification",
    businessTypes: "everyone",
    question: "Do you have a website and/or a Facebook page? What's the link?",
    whyWeAsk: "Markets check these and expect them to match how the business is described.",
    mapsToFields: ["website_or_facebook"],
  },
  {
    id: "recap",
    section: "Wrap",
    businessTypes: "everyone",
    question:
      "Let me play back what I've got so you can correct me, then I'll tell you exactly what happens next.",
    whyWeAsk: "Reading it back catches errors before they reach the underwriter.",
    mapsToFields: [],
  },
];
