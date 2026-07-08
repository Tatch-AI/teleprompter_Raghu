// Hand-curated field-id -> pdfField map for the real GARAGE_001 AcroForm PDF
// (garage_auto/forms/GARAGE_001_Garage_Liability_Application.pdf, 998 generically
// named fields across 12 pages). Built from scripts/out/pdf-field-inventory.json
// (npm run discover-pdf-fields) plus manual spot-checks of the actual PDF pages —
// guessedLabel/nearbyText in the inventory are heuristics, not ground truth, so every
// entry below was cross-checked against neighboring fields' rects/labels on the same
// form line before being trusted.
//
// Only fields with a confident, low-risk 1:1 (or clearly-documented near-1:1) mapping
// are listed here. Fields that don't correspond to any single form field — or whose
// form counterpart is a fundamentally different shape (e.g. a 3-way percentage split
// where we have one enum) — are listed in UNMAPPED_FIELD_IDS instead of being forced.
//
// Layout pattern confirmed while mapping: this form renders most yes/no questions as a
// SINGLE checkbox immediately after the printed question text (not a Yes/No pair). Every
// boolean mapping below uses that single "gate" checkbox — checked = yes/true, unchecked
// = no/false/unknown.

export interface Garage001PdfFieldMapping {
  pdfField: string;
  page: number;
  kind: "text" | "checkbox";
  /** Set when the PDF checkbox means the logical opposite of our field's true value. */
  invert?: boolean;
  /** Anything a future maintainer should know about this mapping's limits. */
  note?: string;
}

export const GARAGE_001_PDF_FIELD_MAP: Partial<Record<string, Garage001PdfFieldMapping>> = {
  // --- business_identity ---------------------------------------------------
  legal_name: {
    pdfField: "Text1000",
    page: 12,
    kind: "text",
    note:
      "Page 1's 'APPLICANT INFORMATION' section has no separate legal-name line (only " +
      "Business Trade Name / Text3, which is our dba_name). The only printed-name field " +
      "for the legal entity is 'APPLICANT/NAMED INSURED' on the page-12 signature block " +
      "(Text1000, distinct from the actual signature field Text1001).",
  },
  dba_name: { pdfField: "Text3", page: 1, kind: "text" },
  // entity_type is a real multi-option checkbox group (one checkbox per option, plus a
  // free-text "Other"), not a single field — see ENTITY_TYPE_PDF_CHECKBOXES /
  // ENTITY_TYPE_OTHER_TEXT_FIELD below and the special-cased handling in
  // lib/exportPdf.ts#fillRealApplicationPdf. This entry exists only so the id is
  // discoverable in this map; fillRealApplicationPdf does not use it directly.
  entity_type: {
    pdfField: "Check Box4",
    page: 1,
    kind: "checkbox",
    note:
      "Anchor/label checkbox only. Real mapping is a 4-way group (Check Box5 'Individual' " +
      "-> our 'Sole proprietor', Check Box6 Partnership, Check Box7 Corporation, " +
      "Check Box8 LLC) plus a free-text 'Other' field (Text4). See " +
      "ENTITY_TYPE_PDF_CHECKBOXES / ENTITY_TYPE_OTHER_TEXT_FIELD.",
  },
  years_in_business: { pdfField: "Text13", page: 1, kind: "text" },
  owner_experience_years: { pdfField: "Text14", page: 1, kind: "text" },

  // --- operations ------------------------------------------------------------
  vehicles_sold_per_year: {
    pdfField: "Text387",
    page: 6,
    kind: "text",
    note: "Item 32, 'How many vehicles do you sell per year?'.",
  },
  sales_revenue: { pdfField: "Text18", page: 1, kind: "text", note: "'Dealers Sales: $___'." },
  service_repair_revenue: {
    pdfField: "Text17",
    page: 1,
    kind: "text",
    note: "'Service/Repair: $___'.",
  },
  buy_here_pay_here: { pdfField: "Check Box403", page: 6, kind: "checkbox" },
  titles_transfer_promptly: { pdfField: "Check Box401", page: 6, kind: "checkbox" },
  self_repossession: { pdfField: "Check Box407", page: 6, kind: "checkbox" },

  // --- vehicles_driving --------------------------------------------------
  plates_loaned_or_rented: {
    pdfField: "Check Box254",
    page: 4,
    kind: "checkbox",
    note: "'Do you lease, rent or loan Dealer, Transporter, or any other type of plates?' (item 15).",
  },
  test_drive_license_check: { pdfField: "Check Box411", page: 6, kind: "checkbox" },
  test_drive_ride_along: { pdfField: "Check Box409", page: 6, kind: "checkbox" },
  overnight_test_drives: { pdfField: "Check Box413", page: 6, kind: "checkbox" },
  loaner_or_rental_vehicles: {
    pdfField: "Check Box256",
    page: 4,
    kind: "checkbox",
    note: "'Do you lease or rent vehicles?' (item 16).",
  },
  rideshare_use_owned_autos: { pdfField: "Check Box415", page: 6, kind: "checkbox" },

  // --- coverage_intent -----------------------------------------------------
  desired_liability_limits: {
    pdfField: "Text539",
    page: 8,
    kind: "text",
    note:
      "'COVERAGES REQUESTED' page, first/primary 'Liability Limit: $___ each accident, " +
      "$___ aggregate' line. Our field is a single free-text answer (e.g. rep says " +
      "'$1M/$2M' or 'state minimum'); it is dropped into this one field as-is rather than " +
      "parsed into separate each-accident/aggregate numbers. Text540 (same row, second " +
      "column) is left unmapped — it isn't clearly a duplicate of the same limit and " +
      "filling it from the same single value would be a guess.",
  },

  // --- history ---------------------------------------------------------------
  current_insurance: {
    pdfField: "Check Box189",
    page: 3,
    kind: "checkbox",
    invert: true,
    note:
      "No field on this form literally asks 'are you currently insured'. Closest signal is " +
      "the 'No Prior Insurance:' checkbox in the Prior Carrier Information block (used " +
      "mainly to flag new ventures with zero insurance history). Checked => treated as " +
      "current_insurance=false (inverted); unchecked is left alone rather than assumed " +
      "true, since an unchecked box here doesn't positively confirm current coverage. " +
      "Verify this is the desired behavior before relying on it.",
  },
  current_carrier: {
    pdfField: "Text190",
    page: 3,
    kind: "text",
    note:
      "Corrects an earlier guess that Text191 was a second current_carrier field: the " +
      "'Current Carrier' row on page 3 is actually 3 columns — Text190 = carrier name, " +
      "Text191 = Policy Year, Text192 = Premium (confirmed via the row's column headers " +
      "and the identical 3-column layout repeated below for two 'Prior Carrier' rows). " +
      "Only the carrier-name column (Text190) is mapped.",
  },
  prior_losses: {
    pdfField: "Check Box200",
    page: 3,
    kind: "checkbox",
    invert: true,
    note: "'No Known Losses' checkbox — checked means no losses, i.e. the inverse of prior_losses=true.",
  },

  // --- online_verification -----------------------------------------------
  website_or_facebook: {
    pdfField: "Text11",
    page: 1,
    kind: "text",
    note: "'What is your Website address? http://www.___' — field holds only the part after 'http://www.'.",
  },
};

// entity_type is a genuine multi-option checkbox group (radio-like, but implemented as
// independent checkboxes on this form), so it can't be expressed as one {pdfField, kind}
// pair. fillRealApplicationPdf special-cases fields.entity_type using this table instead
// of GARAGE_001_PDF_FIELD_MAP.
export const ENTITY_TYPE_PDF_CHECKBOXES: Record<string, string> = {
  "Sole proprietor": "Check Box5", // printed as "Individual" on the form
  Partnership: "Check Box6",
  Corporation: "Check Box7",
  LLC: "Check Box8",
};

// Free-text field for entity_type === "Other" (or any value not in
// ENTITY_TYPE_PDF_CHECKBOXES).
export const ENTITY_TYPE_OTHER_TEXT_FIELD = "Text4";

export const UNMAPPED_FIELD_IDS: { id: string; reason: string }[] = [
  {
    id: "business_type",
    reason:
      "GARAGE_001 has no single 'type of business' checkbox cluster — it's organized by " +
      "operation/coverage section (dealer questions, repair questions, tow questions, " +
      "etc. each live on their own page), so business_type is inferred from which " +
      "sections apply rather than filled into one field.",
  },
  {
    id: "business_story",
    reason:
      "Narrative, multi-sentence field with no line-item counterpart. The closest thing " +
      "on the form is Text16 ('Description of Operations: ___', page 1), but that's a " +
      "single form line meant for a short phrase, not our full narrative — mapping it " +
      "would truncate/misrepresent the story, so it's left unmapped.",
  },
  {
    id: "why_shopping",
    reason:
      "Copilot/journey context (why the customer is shopping now) that GARAGE_001 never " +
      "asks; there is no corresponding question anywhere in the 12-page form.",
  },
  {
    id: "sales_model",
    reason:
      "Our field is a single enum (retail/wholesale/broker/mixed); the form's counterpart " +
      "(Text347/348/349 on page 5) is a 3-way Retail/Broker/Wholesale percentage split " +
      "that must sum to 100%. Forcing one enum value into one of those three % fields " +
      "would misstate the split, so it's left unmapped rather than guessed.",
  },
  {
    id: "dealer_plate_count",
    reason:
      "Our field is a single total; the form (page 5, item 28) breaks dealer plates out " +
      "per vehicle type instead (Text365 Autos / Text367 Motorcycles / Text366 Boats / " +
      "Text368 Trailers) with no 'total' field. Dropping our single count into just the " +
      "Autos box would understate the real total for dealers with mixed-type plates.",
  },
  {
    id: "test_drives_allowed",
    reason:
      "No explicit gate question exists. Items 37-39 (ride-along, license check, " +
      "overnight) all assume test drives happen and ask follow-up specifics directly — " +
      "there's no separate 'do you allow test drives at all' checkbox to fill.",
  },
  {
    id: "lot_security",
    reason:
      "Our field is a free-text description ('fenced and gated', 'cameras', etc.); the " +
      "form's related fields are per-location 'Fence & Gate' checkboxes (Check " +
      "Box293/299/305/311, page 4, one per physical location). Ticking one of those from " +
      "free text would require keyword classification we haven't built, and would still " +
      "lose everything the rep said about cameras, buildings, etc. Too lossy to auto-fill.",
  },
  {
    id: "keys_handling",
    reason:
      "Same shape problem as lot_security: free-text description vs. one specific " +
      "practice on the form ('Key Cabinet in Office', Check Box318/319 for during/after " +
      "hours, page 5). Auto-checking that box from arbitrary free text would frequently " +
      "be wrong for reps who describe a different practice (e.g. lockbox, keys with staff).",
  },
];
