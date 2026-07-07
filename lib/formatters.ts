import { FieldStatus, GarageBusinessType } from "./types";
import { GARAGE_TYPE_OPTIONS } from "./garageTalkTrack";

export function formatFieldValue(value: unknown, type?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (type === "currency" && typeof value === "number") {
    return `$${value.toLocaleString("en-US")}`;
  }
  if (typeof value === "number") return value.toLocaleString("en-US");
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function formatBusinessType(type: GarageBusinessType | null): string {
  if (!type) return "Unknown";
  return GARAGE_TYPE_OPTIONS.find((o) => o.id === type)?.label ?? type;
}

export const STATUS_LABEL: Record<FieldStatus, string> = {
  missing: "Missing",
  low_confidence: "Low confidence",
  needs_review: "Needs review",
  filled: "Filled",
  conflict: "Conflict",
};

export const STATUS_CLASSES: Record<FieldStatus, string> = {
  missing: "bg-slate-700/50 text-slate-300 border border-slate-600/60",
  low_confidence: "bg-amber-500/15 text-amber-300 border border-amber-500/40",
  needs_review: "bg-yellow-400/15 text-yellow-200 border border-yellow-400/40",
  filled: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40",
  conflict: "bg-red-500/20 text-red-300 border border-red-500/50",
};

export const SEVERITY_CLASSES: Record<string, string> = {
  info: "bg-sky-500/15 text-sky-300 border border-sky-500/40",
  appetite: "bg-yellow-400/15 text-yellow-200 border border-yellow-400/40",
  knockout: "bg-red-500/20 text-red-300 border border-red-500/50",
  specialty_market: "bg-purple-500/20 text-purple-300 border border-purple-500/50",
};

export const SECTION_LABEL: Record<string, string> = {
  business_identity: "Business identity",
  location: "Location",
  operations: "Operations",
  coverage_intent: "Coverage intent",
  underwriting_risk: "Underwriting risk",
  drivers_team: "Drivers & team",
  premises: "Premises",
  vehicles_driving: "Vehicles & driving",
  history: "History",
  online_verification: "Online verification",
};
