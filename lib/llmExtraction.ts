import {
  ExtractedFieldCandidate,
  ExtractionResult,
  GarageBusinessType,
  IntakeState,
} from "./types";
import { GARAGE_FIELD_DEFINITIONS, KNOWN_FIELD_IDS } from "./garageFieldDefinitions";
import { GARAGE_RISK_RULES } from "./garageRiskRules";

export const EXTRACTION_SYSTEM_PROMPT = `You are an insurance intake extraction assistant for a commercial insurance brokerage.

Your job is to extract structured GARAGE insurance application fields from a live customer call transcript.

You only extract information explicitly supported by the transcript text.

Rules:
- Do not infer values unless the customer clearly states them.
- Do not guess missing fields.
- Do not complete addresses, names, websites, emails, phone numbers, or carrier names from outside knowledge.
- If a value is ambiguous, assign lower confidence.
- If the transcript contradicts an existing value, report a potential conflict.
- Every extracted value must include an exact evidence quote from the transcript.
- Return strict JSON only.
- Do not include markdown.`;

const EMPTY_RESULT: ExtractionResult = {
  extractedFields: [],
  potentialBusinessType: null,
  potentialConflicts: [],
  riskSignals: [],
  unprocessedNotes: [],
};

export function buildUserPrompt(state: IntakeState, transcriptChunk: string): string {
  const compactFields = GARAGE_FIELD_DEFINITIONS.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    businessTypes: f.businessTypes,
    options: f.options,
  }));
  const currentValues = Object.fromEntries(
    Object.values(state.fields)
      .filter((f) => f.value !== null)
      .map((f) => [f.fieldId, { value: f.value, status: f.status }]),
  );

  return `Vertical: GARAGE_001

Current business type: ${state.businessType ?? "unknown"}

Current accepted/known values:
${JSON.stringify(currentValues, null, 2)}

Field definitions:
${JSON.stringify(compactFields)}

Risk rules:
${JSON.stringify(GARAGE_RISK_RULES.map((r) => ({ id: r.id, fieldId: r.fieldId, triggerValue: r.triggerValue })))}

New transcript chunk:
${transcriptChunk}

Extract any supported application fields from this transcript chunk.

Return JSON with this exact shape:
{
  "extractedFields": [
    { "fieldId": "string", "value": "any", "normalizedValue": "any", "confidence": 0.0, "evidenceQuote": "exact quote", "reasoning": "short" }
  ],
  "potentialBusinessType": "dealer | dealer_plus_repair | repair | body | heavy | tow | parking | car_wash | mixed | null",
  "businessTypeConfidence": 0.0,
  "potentialConflicts": [ { "fieldId": "string", "newValue": "any", "evidenceQuote": "exact quote", "reason": "string" } ],
  "riskSignals": [ { "riskRuleId": "string", "detected": true, "confidence": 0.0, "evidenceQuote": "exact quote", "reason": "string" } ],
  "unprocessedNotes": ["string"]
}`;
}

function sanitizeResult(raw: unknown): ExtractionResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const extractedFields = Array.isArray(obj.extractedFields)
    ? (obj.extractedFields as ExtractedFieldCandidate[]).filter(
        (c) => c && typeof c.fieldId === "string" && KNOWN_FIELD_IDS.has(c.fieldId),
      )
    : [];
  const businessType =
    typeof obj.potentialBusinessType === "string" && obj.potentialBusinessType !== "null"
      ? (obj.potentialBusinessType as GarageBusinessType)
      : null;
  return {
    extractedFields,
    potentialBusinessType: businessType,
    businessTypeConfidence:
      typeof obj.businessTypeConfidence === "number" ? obj.businessTypeConfidence : undefined,
    potentialConflicts: Array.isArray(obj.potentialConflicts) ? (obj.potentialConflicts as ExtractionResult["potentialConflicts"]) : [],
    riskSignals: Array.isArray(obj.riskSignals) ? (obj.riskSignals as ExtractionResult["riskSignals"]) : [],
    unprocessedNotes: Array.isArray(obj.unprocessedNotes) ? (obj.unprocessedNotes as string[]) : [],
  };
}

function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Strip markdown fences / surrounding prose and retry on the first JSON object.
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("No JSON object found in LLM response");
  }
}

async function callOpenAIOnce(
  apiKey: string,
  model: string,
  state: IntakeState,
  transcriptChunk: string,
): Promise<ExtractionResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(state, transcriptChunk) },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  return sanitizeResult(parseJsonLoose(content));
}

export type ExtractorMode = "llm" | "mock";

// Runs the real LLM when a key is present (one silent retry on failure),
// otherwise the deterministic mock. Throws only when the LLM is configured
// but both attempts fail — the API route turns that into a safe no-op.
export async function runExtraction(
  state: IntakeState,
  transcriptChunk: string,
): Promise<{ result: ExtractionResult; mode: ExtractorMode }> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  if (apiKey) {
    try {
      return { result: await callOpenAIOnce(apiKey, model, state, transcriptChunk), mode: "llm" };
    } catch {
      // Silent one-shot retry.
      return { result: await callOpenAIOnce(apiKey, model, state, transcriptChunk), mode: "llm" };
    }
  }

  return { result: mockExtract(state, transcriptChunk), mode: "mock" };
}

// ---------------------------------------------------------------------------
// Deterministic mock extractor — keyword/regex heuristics. Works without a key
// and exercises the full status / conflict / risk pipeline on real-ish text.
// ---------------------------------------------------------------------------

function candidate(
  fieldId: string,
  value: unknown,
  confidence: number,
  evidenceQuote: string,
  reasoning = "",
): ExtractedFieldCandidate {
  return { fieldId, value, confidence, evidenceQuote, reasoning };
}

function hasNegation(text: string, keyword: string): boolean {
  const idx = text.indexOf(keyword);
  if (idx < 0) return false;
  const window = text.slice(Math.max(0, idx - 40), idx + keyword.length);
  return /(never|don't|do not|doesn't|does not|not always|rarely|no\b|without)/.test(window);
}

export function mockExtract(_state: IntakeState, chunkText: string): ExtractionResult {
  const text = chunkText.toLowerCase();
  const fields: ExtractedFieldCandidate[] = [];
  let potentialBusinessType: GarageBusinessType | null = null;
  let businessTypeConfidence: number | undefined;

  // Business type
  const sellsRepairs = /repair|service/.test(text) && /(sell|dealer)/.test(text) && !/no repair/.test(text);
  if (sellsRepairs) {
    potentialBusinessType = "dealer_plus_repair";
    businessTypeConfidence = 0.85;
  } else if (/used[ -]?car|dealer|sell(ing)? (cars|vehicles)|car sales/.test(text)) {
    potentialBusinessType = "dealer";
    businessTypeConfidence = 0.9;
  } else if (/tow|wrecker|roadside/.test(text)) {
    potentialBusinessType = "tow";
    businessTypeConfidence = 0.85;
  } else if (/body shop|paint|collision/.test(text)) {
    potentialBusinessType = "body";
    businessTypeConfidence = 0.85;
  } else if (/car wash|detail/.test(text)) {
    potentialBusinessType = "car_wash";
    businessTypeConfidence = 0.85;
  } else if (/parking|storage lot|valet/.test(text)) {
    potentialBusinessType = "parking";
    businessTypeConfidence = 0.85;
  }

  // Legal name: 1–5 consecutive capitalized words immediately before an entity
  // suffix. Requiring the word right before the suffix to be capitalized avoids
  // matching filler like "...twelve years. We're an LLC".
  const nameMatch = chunkText.match(
    /\b([A-Z][A-Za-z0-9&.'’\-]+(?:\s+[A-Z][A-Za-z0-9&.'’\-]+){0,4})\s+(LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation)\b/,
  );
  if (nameMatch) {
    // Allowing apostrophes (for names like "Dexter's Auto") can pull in a leading
    // contraction ("We're Valley Auto..."); strip common ones so the name is clean.
    const lead = nameMatch[1].replace(
      /^(?:we're|i'm|it's|that's|they're|he's|she's|here's|there's|you're|we've|i've)\s+/i,
      "",
    );
    const fullName = `${lead} ${nameMatch[2]}`.trim();
    fields.push(candidate("legal_name", fullName, 0.9, fullName));
  }

  // Business story — the opening descriptive chunk.
  if (/(we're|we are|we do|day to day|mainly|operation)/.test(text) && chunkText.length > 60) {
    fields.push(candidate("business_story", chunkText.trim(), 0.7, chunkText.trim()));
  }

  // Sales model
  if (/to the public|retail/.test(text)) {
    fields.push(candidate("sales_model", "retail", 0.75, "sell to the public"));
  } else if (/wholesale|dealer-to-dealer|dealer to dealer/.test(text)) {
    fields.push(candidate("sales_model", "wholesale", 0.8, "wholesale"));
  } else if (/broker/.test(text)) {
    fields.push(candidate("sales_model", "broker", 0.8, "broker"));
  }

  // Years in business
  const yib = text.match(
    /(?:been (?:open|around|in business)|in business)\s+(?:for\s+|about\s+)*([a-z]+|\d+)\s+years?/,
  );
  if (yib) fields.push(candidate("years_in_business", yib[1], 0.85, yib[0]));

  // Owner experience
  const exp = text.match(/(?:in the (?:car |auto )?business|doing this|personally)\s+(?:for\s+)?([a-z]+|\d+)\s+years?/);
  if (exp) fields.push(candidate("owner_experience_years", exp[1], 0.85, exp[0]));

  // Entity type
  if (/\bllc\b|l\.l\.c\./.test(text)) fields.push(candidate("entity_type", "LLC", 0.9, "LLC"));
  else if (/corporation|\bcorp\b|\binc\b/.test(text)) fields.push(candidate("entity_type", "Corporation", 0.85, "corporation"));
  else if (/sole prop(?:rietor)?|\bjust me\b|it'?s just me|as an individual/.test(text)) fields.push(candidate("entity_type", "Sole proprietor", 0.8, "sole proprietor"));
  else if (/partnership/.test(text)) fields.push(candidate("entity_type", "Partnership", 0.85, "partnership"));

  // Why shopping
  if (/starting up|just started|new business|contract|switching|renewal|shopping/.test(text)) {
    fields.push(candidate("why_shopping", chunkText.trim(), 0.7, chunkText.trim()));
  }

  // Vehicles sold per year (accepts digits or word-numbers, with soft hedges)
  const sold = text.match(
    /(?:sell|sold|do|move)\s+(?:around|about|roughly|maybe|up to)?\s*(\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s+(?:vehicles|cars|units)/,
  );
  if (sold) fields.push(candidate("vehicles_sold_per_year", sold[1].replace(/,/g, ""), 0.9, sold[0]));

  // Sales revenue
  const rev = text.match(/revenue(?: is)?(?: about| around| roughly)?\s+\$?(\d[\d,]*(?:\.\d+)?)\s*(million|thousand|k|m|billion)?/);
  if (rev) {
    const unit = rev[2] ? ` ${rev[2]}` : "";
    fields.push(candidate("sales_revenue", `${rev[1]}${unit}`, 0.85, rev[0]));
  }

  // Dealer plate count
  const plates = text.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+dealer\s+plates?/);
  if (plates) fields.push(candidate("dealer_plate_count", plates[1], 0.9, plates[0]));
  const platesCorrection = text.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+dealer\s+plates?\s+now/);
  if (platesCorrection) {
    fields.push(candidate("dealer_plate_count", platesCorrection[1], 0.92, platesCorrection[0], "correction"));
  }

  // Plates loaned / rented
  if (/plates?.*(rent|loan|lease)|(rent|loan|lease).*plates?|rent or loan them|loan them out/.test(text)) {
    const loaned = !hasNegation(text, "rent") && !hasNegation(text, "loan") && !/never|don't|do not/.test(text);
    fields.push(candidate("plates_loaned_or_rented", loaned, 0.9, "rent or loan them out"));
  }

  // Buy-here-pay-here financing (dealer carries the paper)
  if (/buy[ -]?here[ -]?pay[ -]?here|carry the paper|finance (my|their|the) own|finance through|finance with|outside financing|credit acceptance/.test(text)) {
    const carriesPaper =
      /buy[ -]?here[ -]?pay[ -]?here|carry the paper|finance (my|their|the) own/.test(text) &&
      !/no buy[ -]?here[ -]?pay[ -]?here|not buy[ -]?here|don't finance|outside financing|finance through|finance with|credit acceptance/.test(text);
    fields.push(candidate("buy_here_pay_here", carriesPaper, 0.85, "buy here pay here"));
  }

  // Self repossession
  if (/repossess|\brepo\b/.test(text)) {
    const repos = !/(no repo|don't repossess|do not repossess|never repossess|don't repo)/.test(text);
    fields.push(candidate("self_repossession", repos, 0.85, "repossess vehicles I sell myself"));
  }

  // Titles transfer promptly
  if (/titles?\s+transfer|transfer\s+(the\s+)?titles?/.test(text)) {
    const promptly = !/(don't transfer|do not transfer|late|delay(ed)?|not promptly)/.test(text);
    fields.push(candidate("titles_transfer_promptly", promptly, 0.85, "titles transfer promptly"));
  }

  // Test drives
  if (/test[ -]?drive/.test(text)) {
    const allowed = !hasNegation(text, "test drive") && !/no test drive|don't (allow|do) test/.test(text);
    fields.push(candidate("test_drives_allowed", allowed, 0.9, "allow test drives"));

    if (/licen[sc]e/.test(text)) {
      const checks = !hasNegation(text, "licen");
      fields.push(candidate("test_drive_license_check", checks, 0.9, "check the customer's license"));
    }
    if (/ride along|ride-along|ride with/.test(text)) {
      const rideAlong = !hasNegation(text, "ride along") && !hasNegation(text, "ride-along") && !/don't always/.test(text);
      fields.push(candidate("test_drive_ride_along", rideAlong, 0.9, "ride along"));
    }
    if (/overnight|extended test/.test(text)) {
      const overnight = !hasNegation(text, "overnight");
      fields.push(candidate("overnight_test_drives", overnight, 0.85, "overnight test drive"));
    }
  }

  // Loaner / rental vehicles
  if (/loaner|rental|rent (a )?car|lease.*vehicle/.test(text) && !/plates?/.test(text)) {
    const loaner = !/(no loaner|don't (give|do) loaner|never)/.test(text);
    fields.push(candidate("loaner_or_rental_vehicles", loaner, 0.8, "loaner cars"));
  }

  // Rideshare
  if (/uber|lyft|rideshare|ride share/.test(text)) {
    const rideshare = !/(no|not|don't|never)/.test(text);
    fields.push(candidate("rideshare_use_owned_autos", rideshare, 0.85, "rideshare"));
  }

  // Lot security (negation-aware: "not fenced or gated" should not report fenced)
  if (/(fenced|gated|cameras?|open lot|lot is open|it's open|just open|in a building|secured)/.test(text)) {
    const secBits: string[] = [];
    const notFenced = /not\s+fenced|no\s+fence|isn'?t\s+fenced|not\s+fenced\s+or\s+gated/.test(text);
    const notGated = /not\s+gated|no\s+gate|isn'?t\s+gated|not\s+fenced\s+or\s+gated/.test(text);
    if (/fenced/.test(text) && !notFenced) secBits.push("fenced");
    if (/gated/.test(text) && !notGated) secBits.push("gated");
    if (/cameras?/.test(text)) secBits.push("cameras");
    if (/in a building/.test(text)) secBits.push("in a building");
    if (/open lot|lot is open|it's open|just open|is open\b|not fenced|not gated/.test(text)) {
      secBits.push("open lot");
    }
    if (secBits.length) fields.push(candidate("lot_security", secBits.join(", "), 0.85, "lot security"));
  }

  // Keys handling
  if (/\bkeys?\b/.test(text)) {
    const keyMatch = chunkText.match(/keys?[^.]*\./i);
    fields.push(candidate("keys_handling", (keyMatch?.[0] ?? chunkText).trim(), 0.85, "keys handling"));
  }

  // Desired liability limits (split limits, or a single "state minimum of $X")
  const limits = text.match(/(\$?[\d.]+\s*[mk]?\s*\/\s*\$?[\d.]+\s*[mk]?|\$1m\/\$2m|1m\/2m)/);
  if (limits) {
    fields.push(candidate("desired_liability_limits", limits[0], 0.8, limits[0]));
  } else {
    const minLimit = text.match(/(?:state\s+)?minimum(?:\s+of)?\s+\$?([\d,]+)\s*(k|thousand|m|million)?/);
    if (minLimit) {
      const unit = minLimit[2] ? ` ${minLimit[2]}` : "";
      fields.push(
        candidate("desired_liability_limits", `${minLimit[1]}${unit} (state minimum)`, 0.8, minLimit[0]),
      );
    } else if (/state minimum/.test(text)) {
      fields.push(candidate("desired_liability_limits", "state minimum", 0.75, "state minimum"));
    }
  }

  // Current insurance / carrier
  if (/insured with|currently insured|current carrier|we have coverage/.test(text)) {
    fields.push(candidate("current_insurance", true, 0.9, "currently insured"));
    const carrier = chunkText.match(/insured with ([A-Z][A-Za-z& ]+?)[.,]/);
    if (carrier) fields.push(candidate("current_carrier", carrier[1].trim(), 0.9, carrier[0]));
  } else if (/first coverage|not insured|no insurance|never had/.test(text)) {
    fields.push(candidate("current_insurance", false, 0.85, "first coverage"));
  }

  // Prior losses
  if (/no claims|no losses|clean|claim[ -]?free/.test(text)) {
    fields.push(candidate("prior_losses", false, 0.9, "no claims in the last three years"));
  } else if (/(had|there was|we had).*(claim|loss|accident)/.test(text)) {
    fields.push(candidate("prior_losses", true, 0.85, "prior loss"));
  }

  // Website / facebook
  const site = chunkText.match(/((https?:\/\/)?[a-z0-9.-]+\.(com|net|org|biz)[^\s]*|facebook\.com\/[^\s]+)/i);
  if (site) fields.push(candidate("website_or_facebook", site[0], 0.85, site[0]));

  return {
    extractedFields: fields,
    potentialBusinessType,
    businessTypeConfidence,
    potentialConflicts: [],
    riskSignals: [],
    unprocessedNotes: [],
  };
}

export { EMPTY_RESULT };
