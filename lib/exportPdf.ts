import { PDFDocument } from "pdf-lib";
import {
  FieldDefinition,
  FieldSection,
  FieldState,
  GarageBusinessType,
  IntakeState,
} from "./types";
import {
  ENTITY_TYPE_OTHER_TEXT_FIELD,
  ENTITY_TYPE_PDF_CHECKBOXES,
  GARAGE_001_PDF_FIELD_MAP,
} from "./garage001PdfFieldMap";

// Schema version for the structured export below — bump this whenever the
// shape changes, so downstream consumers (AMS/carrier API/warehouse) can
// tell which intake records were produced against which contract.
const SUBMISSION_SCHEMA_VERSION = 1;

export interface SubmissionRecord {
  schemaVersion: number;
  intakeId: string;
  formId: string;
  businessType: GarageBusinessType | null;
  generatedAt: string;
  fields: Record<
    string,
    {
      label: string;
      section: FieldSection;
      required: boolean;
      value: unknown;
      status: FieldState["status"];
      confidence: number;
      confirmed: boolean;
      evidenceQuote?: string;
    }
  >;
  missingRequiredFieldIds: string[];
  riskFlags: {
    label: string;
    severity: string;
    resolved: boolean;
    reason: string;
  }[];
  suggestedSupplements: {
    formId: string;
    label: string;
    validated: boolean;
    acknowledged: boolean;
    reason: string;
  }[];
  recommendedCoverageLines: {
    line: string;
    reason: string;
  }[];
  validationIssues: {
    severity: string;
    label: string;
    message: string;
    fieldIds: string[];
  }[];
  drivers: Record<string, { value: unknown; status: FieldState["status"]; confidence: number }>[];
}

// The structured artifact of record — this, not the rendered PDF, is what a
// downstream system (AMS, carrier API, warehouse) should actually consume.
// The PDF is for a human to read; this is for a machine to parse without
// re-scraping rendered text back out of a page.
export function buildSubmissionRecord(
  applicableDefs: FieldDefinition[],
  state: IntakeState,
): SubmissionRecord {
  const fields: SubmissionRecord["fields"] = {};
  for (const def of applicableDefs) {
    const fs = state.fields[def.id];
    if (!fs) continue;
    fields[def.id] = {
      label: def.label,
      section: def.section,
      required: def.required,
      value: fs.status !== "missing" ? fs.normalizedValue ?? fs.value : null,
      status: fs.status,
      confidence: fs.confidence,
      confirmed: fs.confirmed,
      evidenceQuote: fs.evidence[fs.evidence.length - 1]?.quote,
    };
  }

  return {
    schemaVersion: SUBMISSION_SCHEMA_VERSION,
    intakeId: state.intakeId,
    formId: state.formId,
    businessType: state.businessType,
    generatedAt: new Date().toISOString(),
    fields,
    missingRequiredFieldIds: state.missingRequiredFieldIds,
    riskFlags: state.riskFlags.map((f) => ({
      label: f.label,
      severity: f.severity,
      resolved: f.resolved,
      reason: f.reason,
    })),
    suggestedSupplements: state.suggestedSupplements.map((s) => ({
      formId: s.formId,
      label: s.label,
      validated: s.validated,
      acknowledged: s.acknowledged,
      reason: s.reason,
    })),
    recommendedCoverageLines: state.recommendedCoverageLines.map((c) => ({
      line: c.line,
      reason: c.reason,
    })),
    validationIssues: state.validationIssues.map((v) => ({
      severity: v.severity,
      label: v.label,
      message: v.message,
      fieldIds: v.fieldIds,
    })),
    drivers: state.drivers.map((d) =>
      Object.fromEntries(
        Object.entries(d.fields).map(([fieldId, fs]) => [
          fieldId,
          { value: fs.status !== "missing" ? fs.normalizedValue ?? fs.value : null, status: fs.status, confidence: fs.confidence },
        ]),
      ),
    ),
  };
}

export function downloadJson(record: SubmissionRecord, filename: string): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Fetches the raw GARAGE_001 source PDF bytes from a small server route
// (app/api/export-pdf) rather than reading garage_auto/ from disk directly — this file
// runs in the browser, and the source form lives outside public/, so a server route is
// the simplest way to hand its bytes to client-side pdf-lib without duplicating the
// 1.3MB binary into the app's static assets.
async function fetchSourceApplicationPdfBytes(): Promise<Uint8Array> {
  const res = await fetch("/api/export-pdf");
  if (!res.ok) {
    throw new Error(`Failed to load source application PDF (HTTP ${res.status})`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

// Effective value for a field: prefer the deterministically normalized value (e.g. an
// actual boolean for boolean fields) and fall back to the raw extracted value.
function effectiveFieldValue(fs: FieldState | undefined): unknown {
  if (!fs) return null;
  return fs.normalizedValue ?? fs.value ?? null;
}

// Fills the REAL GARAGE_001 AcroForm PDF (garage_auto/forms/GARAGE_001_Garage_Liability_
// Application.pdf, 998 generically-named fields) using the field-id -> pdfField map in
// lib/garage001PdfFieldMap.ts. The form is left editable (not flattened) so the rep can
// still adjust values in a PDF viewer before submitting.
//
// `applicableDefs` and `businessType` aren't needed to decide which pdfFields to touch
// (the map is keyed directly by field id and values come from `fields`), but the
// parameter is kept in case a future caller wants to restrict filling to only the fields
// relevant to the selected business type.
export async function fillRealApplicationPdf(
  applicableDefs: FieldDefinition[],
  fields: Record<string, FieldState>,
  businessType: GarageBusinessType | null,
): Promise<Uint8Array> {
  void applicableDefs;
  void businessType;

  const sourceBytes = await fetchSourceApplicationPdfBytes();
  const doc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const form = doc.getForm();

  for (const [fieldId, mapping] of Object.entries(GARAGE_001_PDF_FIELD_MAP)) {
    if (!mapping || fieldId === "entity_type") continue; // entity_type is special-cased below
    const fs = fields[fieldId];
    if (!fs || fs.status === "missing") continue;

    const value = effectiveFieldValue(fs);
    if (value === null || value === undefined || value === "") continue;

    try {
      if (mapping.kind === "text") {
        form.getTextField(mapping.pdfField).setText(String(value));
      } else {
        const checked = mapping.invert ? !Boolean(value) : Boolean(value);
        const checkbox = form.getCheckBox(mapping.pdfField);
        if (checked) checkbox.check();
        else checkbox.uncheck();
      }
    } catch {
      // Field renamed/missing in this PDF revision, or the wrong widget type for its
      // mapping (e.g. pdf-lib disagreeing on checkbox vs text) — skip rather than fail
      // the whole export over one field.
      continue;
    }
  }

  // entity_type is a real multi-option checkbox group (one checkbox per option, plus a
  // free-text "Other"), not a single {pdfField, kind} pair, so it can't go through the
  // generic loop above.
  const entityFs = fields.entity_type;
  if (entityFs && entityFs.status !== "missing") {
    const value = String(effectiveFieldValue(entityFs) ?? "").trim();
    const checkboxField = value ? ENTITY_TYPE_PDF_CHECKBOXES[value] : undefined;
    try {
      if (checkboxField) {
        form.getCheckBox(checkboxField).check();
      } else if (value) {
        form.getTextField(ENTITY_TYPE_OTHER_TEXT_FIELD).setText(value);
      }
    } catch {
      // Skip — see comment in the main loop above.
    }
  }

  try {
    form.updateFieldAppearances();
  } catch {
    // Non-fatal: worst case a PDF viewer regenerates appearances itself on open.
  }

  return doc.save();
}

export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
