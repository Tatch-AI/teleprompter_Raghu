import { DriverRecord, FieldState, FieldType } from "./types";

// Minimal driver schedule catalog. Per Harper University training material,
// the "big three" — full name, DOB, license number — are what actually gate
// submission ("the number one reason submissions fail"); license state is
// useful (out-of-state mismatch checks) but not itself a hard blocker yet.
export interface DriverFieldDefinition {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  question: string;
  whyWeAsk: string;
}

export const DRIVER_FIELD_DEFINITIONS: DriverFieldDefinition[] = [
  {
    id: "driver_name",
    label: "Driver name",
    type: "string",
    required: true,
    question: "Who's going to be driving — can I get the full name?",
    whyWeAsk: "The application can't be submitted without at least one named driver.",
  },
  {
    id: "driver_dob",
    label: "Date of birth",
    type: "string",
    required: true,
    question: "And their date of birth?",
    whyWeAsk: "Age is a rating factor and part of the minimum driver record underwriting requires.",
  },
  {
    id: "driver_license_number",
    label: "License number",
    type: "string",
    required: true,
    question: "What's their driver's license number?",
    whyWeAsk: "A license number is required for every listed driver — no exceptions.",
  },
  {
    id: "driver_license_state",
    label: "License state",
    type: "string",
    required: false,
    question: "What state is that license from?",
    whyWeAsk: "Out-of-state licenses can be a red flag markets want addressed.",
  },
];

export const DRIVER_FIELD_BY_ID: Record<string, DriverFieldDefinition> = Object.fromEntries(
  DRIVER_FIELD_DEFINITIONS.map((f) => [f.id, f]),
);

export const DRIVER_KNOWN_FIELD_IDS: ReadonlySet<string> = new Set(
  DRIVER_FIELD_DEFINITIONS.map((f) => f.id),
);

export function createEmptyDriver(id: string): DriverRecord {
  const fields: Record<string, FieldState> = {};
  for (const def of DRIVER_FIELD_DEFINITIONS) {
    fields[def.id] = {
      fieldId: def.id,
      value: null,
      normalizedValue: null,
      status: "missing",
      confidence: 0,
      bestConfidence: 0,
      everSeen: false,
      confirmed: false,
      evidence: [],
    };
  }
  return { id, fields };
}

export function isDriverComplete(driver: DriverRecord): boolean {
  return DRIVER_FIELD_DEFINITIONS.filter((d) => d.required).every(
    (d) => driver.fields[d.id]?.status !== "missing",
  );
}
