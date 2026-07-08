// Introspects the real GARAGE_001 AcroForm PDF: dumps every field's name/type/page/rect,
// then attaches a best-guess label from nearby page text (nearest text run to the left of,
// or directly above, the field's rect). This is a starting point for hand-curating a
// field-id -> pdfField map in lib/garage001PdfFieldMap.ts — proximity guesses are noisy on a
// dense 12-page/998-field form and must be spot-checked against the actual PDF, not trusted blindly.
//
// Usage:
//   npm run discover-pdf-fields                 # writes scripts/out/pdf-field-inventory.json
//   npm run discover-pdf-fields -- --page=3      # only print page 3 fields to stdout

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

// pdfjs-dist's legacy Node build avoids DOM/worker requirements; ESM-only in v4, so import() it
// lazily inside main() — this file is loaded via tsx's CJS transform, which can't have a
// top-level await.
let pdfjs: any;

const PDF_PATH = "garage_auto/forms/GARAGE_001_Garage_Liability_Application.pdf";
const OUT_PATH = "scripts/out/pdf-field-inventory.json";

type Rect = [number, number, number, number];

interface FieldEntry {
  pdfField: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "other";
  page: number; // 1-indexed
  rect: Rect;
  guessedLabel: string | null;
  nearbyText: string[];
}

interface TextRun {
  str: string;
  x: number;
  y: number; // baseline, PDF coordinate space (origin bottom-left)
  width: number;
  height: number;
}

async function getPageTextRuns(pdfDoc: any, pageNumber: number): Promise<TextRun[]> {
  const page = await pdfDoc.getPage(pageNumber);
  const content = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  return content.items
    .filter((item: any) => typeof item.str === "string" && item.str.trim().length > 0)
    .map((item: any) => {
      // item.transform = [scaleX, skewX, skewY, scaleY, x, y] in PDF space already
      // (pdfjs text content is reported in PDF user space, not flipped like the viewport canvas).
      const [, , , , x, y] = item.transform;
      return {
        str: item.str.trim(),
        x,
        y,
        width: item.width,
        height: item.height || 8,
      };
    });
}

function fieldType(constructorName: string): FieldEntry["type"] {
  if (constructorName.includes("Text")) return "text";
  if (constructorName.includes("CheckBox")) return "checkbox";
  if (constructorName.includes("RadioGroup")) return "radio";
  if (constructorName.includes("Dropdown") || constructorName.includes("OptionList")) return "dropdown";
  return "other";
}

// Best-guess label: prefer a text run on roughly the same baseline immediately to the
// left of the field (classic "Label: ____" layout); fall back to the nearest run above.
function guessLabel(rect: Rect, runs: TextRun[]): { label: string | null; nearby: string[] } {
  const [x0, y0, x1, y1] = rect;
  const midY = (y0 + y1) / 2;

  const sameLine = runs
    .filter((r) => r.x <= x0 + 2 && Math.abs(r.y + r.height / 2 - midY) < Math.max(6, (y1 - y0) / 2 + 4))
    .sort((a, b) => b.x - a.x); // closest (rightmost) first

  const above = runs
    .filter((r) => r.y >= y1 - 2 && r.y - y1 < 24 && r.x < x1 && r.x + r.width > x0 - 40)
    .sort((a, b) => a.y - b.y); // closest (lowest y above) first

  const nearby = [...sameLine.slice(0, 2).map((r) => r.str), ...above.slice(0, 2).map((r) => r.str)];

  const label = sameLine[0]?.str ?? above[0]?.str ?? null;
  return { label, nearby };
}

async function main() {
  pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const onlyPageArg = process.argv.find((a) => a.startsWith("--page="));
  const onlyPage = onlyPageArg ? Number(onlyPageArg.split("=")[1]) : null;

  const bytes = new Uint8Array(readFileSync(PDF_PATH));
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const pdfjsDoc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const fields = form.getFields();

  // Map each field to the page it's on via its widget annotation refs.
  const pageOfField = new Map<string, number>();
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const pageRef = pages[i].ref;
    for (const field of fields) {
      const widgets = field.acroField.getWidgets();
      for (const w of widgets) {
        const p = w.P();
        if (p && p.tag === pageRef.tag && p.objectNumber === pageRef.objectNumber) {
          pageOfField.set(field.getName(), i + 1);
        }
      }
    }
  }

  // Cache text runs per page (only for pages that actually have fields, and honor --page filter).
  const textRunsByPage = new Map<number, TextRun[]>();

  const entries: FieldEntry[] = [];
  for (const field of fields) {
    const name = field.getName();
    const page = pageOfField.get(name) ?? -1;
    if (onlyPage && page !== onlyPage) continue;

    const widgets = field.acroField.getWidgets();
    const rect = widgets[0]?.getRectangle();
    if (!rect) continue;

    if (!textRunsByPage.has(page) && page > 0) {
      textRunsByPage.set(page, await getPageTextRuns(pdfjsDoc, page));
    }
    const runs = textRunsByPage.get(page) ?? [];

    const rectTuple: Rect = [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
    const { label, nearby } = guessLabel(rectTuple, runs);

    entries.push({
      pdfField: name,
      type: fieldType(field.constructor.name),
      page,
      rect: rectTuple,
      guessedLabel: label,
      nearbyText: nearby,
    });
  }

  entries.sort((a, b) => a.page - b.page || a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0]);

  if (onlyPage) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  mkdirSync("scripts/out", { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ sourcePdf: PDF_PATH, fieldCount: entries.length, fields: entries }, null, 2));
  console.log(`Wrote ${entries.length} fields (of ${fields.length} total) to ${OUT_PATH}`);
  const withLabel = entries.filter((e) => e.guessedLabel).length;
  console.log(`Guessed a label for ${withLabel}/${entries.length} fields (${Math.round((withLabel / entries.length) * 100)}%).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
