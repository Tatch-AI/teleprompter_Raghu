import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_PDF_PATH = path.join(
  process.cwd(),
  "garage_auto",
  "forms",
  "GARAGE_001_Garage_Liability_Application.pdf",
);

// Serves the raw GARAGE_001 source PDF bytes so lib/exportPdf.ts's
// fillRealApplicationPdf (which runs client-side, like buildApplicationPdf) can fetch,
// fill, and save it with pdf-lib in the browser. Reading it here with node:fs — rather
// than copying the 1.3MB binary into public/ or bundling it into client JS — keeps the
// source form as the single on-disk copy under garage_auto/, matching how
// app/api/feedback/route.ts already reads/writes local files server-side.
export async function GET() {
  try {
    const bytes = await readFile(SOURCE_PDF_PATH);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read source application PDF: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
