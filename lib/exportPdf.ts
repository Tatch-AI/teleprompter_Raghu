import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { FieldDefinition, FieldSection, FieldState, GarageBusinessType } from "./types";
import { formatBusinessType, formatFieldValue, SECTION_LABEL, STATUS_LABEL } from "./formatters";

const SECTION_ORDER: FieldSection[] = [
  "business_identity",
  "operations",
  "coverage_intent",
  "vehicles_driving",
  "premises",
  "history",
  "online_verification",
  "underwriting_risk",
  "drivers_team",
  "location",
];

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 54;
const LINE = 16;

// Generates a clean, filled GARAGE_001 application PDF from the intake state.
// Runs in the browser (pdf-lib is isomorphic) so the rep can download on the spot.
export async function buildApplicationPdf(
  applicableDefs: FieldDefinition[],
  fields: Record<string, FieldState>,
  businessType: GarageBusinessType | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const text = (
    p: PDFPage,
    s: string,
    x: number,
    yy: number,
    f: PDFFont,
    size: number,
    color = rgb(0.1, 0.12, 0.18),
  ) => p.drawText(s, { x, y: yy, size, font: f, color });

  // Header
  text(page, "GARAGE_001 — Commercial Garage Application", MARGIN, y, bold, 16);
  y -= LINE + 4;
  text(page, `Business type: ${formatBusinessType(businessType)}`, MARGIN, y, font, 11, rgb(0.3, 0.34, 0.42));
  y -= LINE;
  text(page, `Generated: ${new Date().toLocaleString()}`, MARGIN, y, font, 10, rgb(0.45, 0.48, 0.55));
  y -= LINE + 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1,
    color: rgb(0.8, 0.82, 0.88),
  });
  y -= LINE;

  const grouped = SECTION_ORDER.map((section) => ({
    section,
    defs: applicableDefs
      .filter((d) => d.section === section)
      .sort((a, b) => a.priority - b.priority),
  })).filter((g) => g.defs.length > 0);

  for (const group of grouped) {
    newPageIfNeeded(LINE * 3);
    text(page, SECTION_LABEL[group.section] ?? group.section, MARGIN, y, bold, 12, rgb(0.13, 0.2, 0.4));
    y -= LINE + 2;

    for (const def of group.defs) {
      newPageIfNeeded(LINE);
      const fs = fields[def.id];
      const value = fs && fs.status !== "missing" ? formatFieldValue(fs.value, def.type) : "—";
      const status = fs ? STATUS_LABEL[fs.status] : "Missing";
      const confirmedMark = fs?.confirmed ? " (rep-confirmed)" : "";

      const label = `${def.label}${def.required ? " *" : ""}:`;
      text(page, label, MARGIN + 8, y, bold, 10, rgb(0.25, 0.28, 0.35));
      // Value wraps if long.
      const maxChars = 62;
      const valStr = String(value);
      const lines = valStr.length > maxChars ? chunkString(valStr, maxChars) : [valStr];
      text(page, lines[0], MARGIN + 200, y, font, 10);
      text(page, `[${status}${confirmedMark}]`, PAGE_W - MARGIN - 150, y, font, 8, rgb(0.5, 0.53, 0.6));
      y -= LINE;
      for (let i = 1; i < lines.length; i++) {
        newPageIfNeeded(LINE);
        text(page, lines[i], MARGIN + 200, y, font, 10);
        y -= LINE;
      }
    }
    y -= 6;
  }

  newPageIfNeeded(LINE * 2);
  y -= 4;
  text(
    page,
    "* required field. Values marked (rep-confirmed) were verified by the agent.",
    MARGIN,
    y,
    font,
    8,
    rgb(0.5, 0.53, 0.6),
  );

  return doc.save();
}

function chunkString(s: string, size: number): string[] {
  const words = s.split(" ");
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > size) {
      if (line) out.push(line.trim());
      line = w;
    } else {
      line = `${line} ${w}`;
    }
  }
  if (line.trim()) out.push(line.trim());
  return out.length ? out : [s];
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
