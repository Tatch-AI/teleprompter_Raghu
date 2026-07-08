// Deterministic workflow engine. This file owns ALL decision logic:
// normalization, status, conflicts, risk flags, missing-field computation,
// talk-track satisfaction, and next-question selection. The LLM never touches it.

import {
  ConflictRecord,
  DriverRecord,
  EvidenceSnippet,
  ExtractedFieldCandidate,
  ExtractionResult,
  FieldDefinition,
  FieldState,
  FieldStatus,
  GarageBusinessType,
  IntakeState,
  NextBestQuestion,
  RiskFlag,
  SuggestedSupplement,
  TalkTrackStep,
  TranscriptChunk,
} from "./types";
import { FIELD_BY_ID, GARAGE_FIELD_DEFINITIONS, KNOWN_FIELD_IDS } from "./garageFieldDefinitions";
import { GARAGE_TALK_TRACK } from "./garageTalkTrack";
import { GARAGE_RISK_RULES } from "./garageRiskRules";
import { GARAGE_SUPPLEMENT_RULES } from "./garageSupplementRules";
import { getRecommendedCoverageLines } from "./garageCoverageRules";
import { detectValidationIssues } from "./garageValidationRules";
import {
  DRIVER_FIELD_BY_ID,
  DRIVER_KNOWN_FIELD_IDS,
  createEmptyDriver,
  isDriverComplete,
} from "./garageDriverFields";
import { formatFieldValue } from "./formatters";

export const AUTO_FILL_THRESHOLD = 0.8;
export const NEEDS_REVIEW_THRESHOLD = 0.55;
const BUSINESS_TYPE_MIN = 0.4;
const BUSINESS_TYPE_FLIP_MARGIN = 0.2;

// ---------------------------------------------------------------------------
// Normalization (deterministic — never trust the LLM's normalizedValue blindly)
// ---------------------------------------------------------------------------

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

function parseNumberLike(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const text = raw.toLowerCase().trim();
  if (text in WORD_NUMBERS) return WORD_NUMBERS[text];

  const cleaned = text.replace(/[$,]/g, "");
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    // Word-number embedded in a phrase, e.g. "three plates".
    for (const [word, n] of Object.entries(WORD_NUMBERS)) {
      if (new RegExp(`\\b${word}\\b`).test(text)) return n;
    }
    return null;
  }
  let value = parseFloat(match[1]);
  if (/\b(billion|bn|b)\b/.test(cleaned)) value *= 1_000_000_000;
  else if (/\b(million|mm|m)\b/.test(cleaned) || /\dm\b/.test(cleaned)) value *= 1_000_000;
  else if (/\b(thousand|k)\b/.test(cleaned) || /\dk\b/.test(cleaned)) value *= 1_000;
  return value;
}

function parseBooleanLike(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const t = raw.toLowerCase().trim();
    if (["true", "yes", "y", "correct", "affirmative"].includes(t)) return true;
    if (["false", "no", "n", "negative", "none"].includes(t)) return false;
  }
  return null;
}

export function normalizeCandidate(
  def: FieldDefinition,
  rawValue: unknown,
  providedNormalized?: unknown,
): unknown {
  switch (def.type) {
    case "boolean": {
      const b = parseBooleanLike(rawValue);
      return b === null ? parseBooleanLike(providedNormalized) : b;
    }
    case "number":
    case "currency": {
      const n = parseNumberLike(rawValue);
      return n === null ? parseNumberLike(providedNormalized) : n;
    }
    case "enum": {
      const text = String(rawValue ?? "").toLowerCase().trim();
      const options = def.options ?? [];
      const exact = options.find((o) => o.toLowerCase() === text);
      if (exact) return exact;
      const partial = options.find(
        (o) => text.includes(o.toLowerCase()) || o.toLowerCase().includes(text),
      );
      return partial ?? (typeof rawValue === "string" ? rawValue.trim() : rawValue);
    }
    default: {
      if (typeof rawValue === "string") return rawValue.trim();
      return rawValue;
    }
  }
}

export function valuesEquivalent(a: unknown, b: unknown, type: FieldDefinition["type"]): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  if (type === "number" || type === "currency") {
    return Math.abs(Number(a) - Number(b)) < 1e-6;
  }
  if (type === "boolean") return Boolean(a) === Boolean(b);
  if (typeof a === "string" && typeof b === "string") {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function clampConfidence(c: number): number {
  if (!Number.isFinite(c)) return 0;
  return Math.max(0, Math.min(1, c));
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

export function statusFromConfidence(confidence: number): FieldStatus {
  if (confidence >= AUTO_FILL_THRESHOLD) return "filled";
  if (confidence >= NEEDS_REVIEW_THRESHOLD) return "needs_review";
  if (confidence > 0) return "low_confidence";
  return "missing";
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

// Never downgrade a filled field; needs_review is sticky until the rep confirms.
function deriveStatus(fs: FieldState, def: FieldDefinition): FieldStatus {
  if (fs.confirmed) return "filled";
  if (def.narrative && !isEmptyValue(fs.value)) return "filled";
  if (fs.status === "filled") return "filled";
  if (fs.status === "needs_review") return "needs_review";
  return statusFromConfidence(fs.bestConfidence);
}

// ---------------------------------------------------------------------------
// Applicability
// ---------------------------------------------------------------------------

export function isFieldApplicable(
  def: FieldDefinition,
  businessType: GarageBusinessType | null,
): boolean {
  if (def.businessTypes === "everyone") return true;
  if (businessType === null) return false;
  if (businessType === "mixed") return true;
  return def.businessTypes.includes(businessType);
}

export function dependenciesSatisfied(def: FieldDefinition, state: IntakeState): boolean {
  if (!def.dependencies || def.dependencies.length === 0) return true;
  return def.dependencies.every((dep) => {
    const dfs = state.fields[dep.fieldId];
    const val = dfs?.normalizedValue ?? null;
    switch (dep.operator) {
      case "exists":
        return !isEmptyValue(val);
      case "equals":
        return val === dep.value;
      case "not_equals":
        return val !== dep.value;
      default:
        return true;
    }
  });
}

export function getApplicableFieldDefinitions(
  businessType: GarageBusinessType | null,
): FieldDefinition[] {
  return GARAGE_FIELD_DEFINITIONS.filter((def) => isFieldApplicable(def, businessType));
}

export function getApplicableSteps(businessType: GarageBusinessType | null): TalkTrackStep[] {
  return GARAGE_TALK_TRACK.filter((step) => {
    if (step.businessTypes === "everyone") return true;
    if (businessType === null) return false;
    if (businessType === "mixed") return true;
    return step.businessTypes.includes(businessType);
  });
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export function appendTranscriptChunk(state: IntakeState, chunk: TranscriptChunk): IntakeState {
  return { ...state, transcriptChunks: [...state.transcriptChunks, chunk] };
}

function mergeCandidate(
  fields: Record<string, FieldState>,
  candidate: ExtractedFieldCandidate,
  chunk: TranscriptChunk,
): void {
  if (!KNOWN_FIELD_IDS.has(candidate.fieldId)) return; // drop hallucinated fieldIds
  const def = FIELD_BY_ID[candidate.fieldId];
  const normalized = normalizeCandidate(def, candidate.value, candidate.normalizedValue);
  if (isEmptyValue(normalized) && def.type !== "boolean") return;

  const fs = { ...fields[candidate.fieldId] };
  fs.evidence = [...fs.evidence];
  const conf = clampConfidence(candidate.confidence);
  const snippet: EvidenceSnippet = {
    transcriptChunkId: chunk.id,
    quote: candidate.evidenceQuote?.trim() || chunk.text,
    speaker: chunk.speaker,
  };

  // Field is in an unresolved conflict — don't churn it further.
  if (fs.status === "conflict" && fs.conflict && !fs.conflict.resolved) {
    fields[candidate.fieldId] = fs;
    return;
  }

  // Narrative fields accumulate free-text context; they never "conflict".
  // Keep the first captured value so the story stays stable.
  if (def.narrative && fs.everSeen && !isEmptyValue(fs.value)) {
    fields[candidate.fieldId] = fs;
    return;
  }

  if (fs.everSeen && !isEmptyValue(fs.value)) {
    if (valuesEquivalent(normalized, fs.normalizedValue, def.type)) {
      // Reinforcement: raise best confidence, add evidence, never downgrade.
      fs.bestConfidence = Math.max(fs.bestConfidence, conf);
      fs.confidence = conf;
      fs.evidence = [...fs.evidence, snippet].slice(-4);
      fs.status = deriveStatus(fs, def);
      fs.lastUpdatedAt = chunk.createdAt;
    } else {
      // Contradiction: raise a conflict, keep the existing value.
      const conflict: ConflictRecord = {
        id: `conflict-${candidate.fieldId}-${chunk.id}`,
        fieldId: candidate.fieldId,
        existingValue: fs.value,
        newValue: candidate.value,
        existingEvidence: fs.evidence[fs.evidence.length - 1],
        newEvidence: snippet,
        reason: `Earlier answer was "${formatFieldValue(fs.value, def.type)}", now hearing "${formatFieldValue(candidate.value, def.type)}".`,
        resolved: false,
      };
      fs.conflict = conflict;
      fs.status = "conflict";
      fs.lastUpdatedAt = chunk.createdAt;
    }
  } else {
    // First time we have a value for this field.
    fs.value = candidate.value;
    fs.normalizedValue = normalized;
    fs.everSeen = true;
    fs.confirmed = false;
    fs.bestConfidence = conf;
    fs.confidence = conf;
    fs.evidence = [snippet];
    fs.status = def.narrative ? "filled" : statusFromConfidence(conf);
    fs.needsReviewReason =
      fs.status === "needs_review"
        ? "Heard in the review confidence band — confirm with the customer."
        : fs.status === "low_confidence"
          ? "Low-confidence signal — likely needs an explicit question."
          : undefined;
    fs.lastUpdatedAt = chunk.createdAt;
  }

  fields[candidate.fieldId] = fs;
}

export function mergeExtractedFields(
  state: IntakeState,
  candidates: ExtractedFieldCandidate[],
  chunk: TranscriptChunk,
): IntakeState {
  const fields: Record<string, FieldState> = { ...state.fields };
  for (const candidate of candidates) mergeCandidate(fields, candidate, chunk);
  return { ...state, fields };
}

// Same merge semantics as mergeCandidate (status-from-confidence, conflict
// detection, never-downgrade), scoped to drivers[0] instead of state.fields.
// Minimal version: one driver only — see futurescope.md item 1 for the
// multi-driver plan.
export function mergeDriverCandidates(
  state: IntakeState,
  candidates: ExtractedFieldCandidate[],
  chunk: TranscriptChunk,
): IntakeState {
  const known = candidates.filter((c) => DRIVER_KNOWN_FIELD_IDS.has(c.fieldId));
  if (known.length === 0) return state;

  const driver: DriverRecord = state.drivers[0]
    ? { ...state.drivers[0], fields: { ...state.drivers[0].fields } }
    : createEmptyDriver("driver-1");

  for (const candidate of known) {
    const def = DRIVER_FIELD_BY_ID[candidate.fieldId];
    const normalized = normalizeCandidate({ type: def.type } as FieldDefinition, candidate.value, candidate.normalizedValue);
    if (isEmptyValue(normalized)) continue;

    const fs: FieldState = { ...driver.fields[candidate.fieldId] };
    fs.evidence = [...fs.evidence];
    const conf = clampConfidence(candidate.confidence);
    const snippet: EvidenceSnippet = {
      transcriptChunkId: chunk.id,
      quote: candidate.evidenceQuote?.trim() || chunk.text,
      speaker: chunk.speaker,
    };

    if (fs.status === "conflict" && fs.conflict && !fs.conflict.resolved) {
      driver.fields[candidate.fieldId] = fs;
      continue;
    }

    if (fs.everSeen && !isEmptyValue(fs.value)) {
      if (valuesEquivalent(normalized, fs.normalizedValue, def.type)) {
        fs.bestConfidence = Math.max(fs.bestConfidence, conf);
        fs.confidence = conf;
        fs.evidence = [...fs.evidence, snippet].slice(-4);
        fs.status = fs.status === "filled" || fs.confirmed ? "filled" : statusFromConfidence(fs.bestConfidence);
        fs.lastUpdatedAt = chunk.createdAt;
      } else {
        fs.conflict = {
          id: `conflict-driver-${candidate.fieldId}-${chunk.id}`,
          fieldId: candidate.fieldId,
          existingValue: fs.value,
          newValue: candidate.value,
          existingEvidence: fs.evidence[fs.evidence.length - 1],
          newEvidence: snippet,
          reason: `Earlier answer was "${fs.value}", now hearing "${candidate.value}".`,
          resolved: false,
        };
        fs.status = "conflict";
        fs.lastUpdatedAt = chunk.createdAt;
      }
    } else {
      fs.value = candidate.value;
      fs.normalizedValue = normalized;
      fs.everSeen = true;
      fs.confirmed = false;
      fs.bestConfidence = conf;
      fs.confidence = conf;
      fs.evidence = [snippet];
      fs.status = statusFromConfidence(conf);
      fs.lastUpdatedAt = chunk.createdAt;
    }

    driver.fields[candidate.fieldId] = fs;
  }

  return { ...state, drivers: [driver, ...state.drivers.slice(1)] };
}

function applyBusinessType(
  state: IntakeState,
  potential: GarageBusinessType | null | undefined,
  confidence: number | undefined,
): IntakeState {
  if (!potential) return state;
  const conf = clampConfidence(confidence ?? 0.7);
  let nextType = state.businessType;
  let nextConf = state.businessTypeConfidence;

  if (state.businessType === null) {
    if (conf >= BUSINESS_TYPE_MIN) {
      nextType = potential;
      nextConf = conf;
    }
  } else if (potential !== state.businessType && conf >= state.businessTypeConfidence + BUSINESS_TYPE_FLIP_MARGIN) {
    // Sticky: only flip on materially stronger evidence.
    nextType = potential;
    nextConf = conf;
  }

  if (nextType === state.businessType) return state;

  const fields = { ...state.fields };
  const bt = { ...fields["business_type"] };
  bt.value = nextType;
  bt.normalizedValue = nextType;
  bt.everSeen = true;
  bt.confidence = nextConf;
  bt.bestConfidence = Math.max(bt.bestConfidence, nextConf);
  bt.status = "filled";
  bt.evidence = bt.evidence.length ? bt.evidence : [];
  fields["business_type"] = bt;

  return { ...state, businessType: nextType, businessTypeConfidence: nextConf, fields };
}

// ---------------------------------------------------------------------------
// Talk-track satisfaction & missing fields
// ---------------------------------------------------------------------------

function fieldIsPresent(fs: FieldState | undefined): boolean {
  return !!fs && fs.status !== "missing";
}

export function isStepSatisfied(step: TalkTrackStep, state: IntakeState): boolean {
  const businessType = state.businessType;
  const mapped = step.mapsToFields
    .map((id) => FIELD_BY_ID[id])
    .filter((def): def is FieldDefinition => !!def)
    .filter((def) => isFieldApplicable(def, businessType) && dependenciesSatisfied(def, state));

  const blocking = mapped.filter((def) => def.required || def.narrative);
  if (blocking.length === 0) return true; // e.g. recap / optional-only steps
  return blocking.every((def) => fieldIsPresent(state.fields[def.id]));
}

export function computeCompletedSteps(state: IntakeState): string[] {
  return getApplicableSteps(state.businessType)
    .filter((step) => step.id !== "recap" && step.mapsToFields.length > 0)
    .filter((step) => isStepSatisfied(step, state))
    .map((step) => step.id);
}

export function computeMissingRequiredFields(state: IntakeState): string[] {
  return getApplicableFieldDefinitions(state.businessType)
    .filter((def) => def.required && dependenciesSatisfied(def, state))
    .filter((def) => state.fields[def.id]?.status === "missing")
    .sort((a, b) => a.priority - b.priority)
    .map((def) => def.id);
}

// ---------------------------------------------------------------------------
// Risk flags (fire only on FILLED fields; clear when the value stops triggering)
// ---------------------------------------------------------------------------

function filledEquals(fs: FieldState | undefined, expected: unknown): boolean {
  return !!fs && fs.status === "filled" && fs.normalizedValue === expected;
}

function keysLeftInVehicle(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const t = value.toLowerCase();
  if (/(office|cabinet|taken home|take.* home|key box in the office|lockbox in the office)/.test(t)) {
    return false;
  }
  return /(in the vehicle|in the car|on the vehicle|in vehicle|left in the|keys in the ignition|vehicle-mounted|lockbox on)/.test(t);
}

export function detectRiskFlags(state: IntakeState, previous: RiskFlag[]): RiskFlag[] {
  const prevResolved: Record<string, boolean> = {};
  for (const f of previous) prevResolved[f.ruleId] = f.resolved;

  const flags: RiskFlag[] = [];
  for (const rule of GARAGE_RISK_RULES) {
    const def = FIELD_BY_ID[rule.fieldId];
    if (!def || !isFieldApplicable(def, state.businessType) || !dependenciesSatisfied(def, state)) {
      continue;
    }
    const fs = state.fields[rule.fieldId];
    let holds = false;
    let evidence: EvidenceSnippet | undefined;

    if (rule.crossField) {
      if (rule.id === "self_repo_without_bhph") {
        const sr = state.fields["self_repossession"];
        const bh = state.fields["buy_here_pay_here"];
        holds = filledEquals(sr, true) && filledEquals(bh, false);
        evidence = sr?.evidence[sr.evidence.length - 1];
      } else if (rule.id === "keys_left_in_vehicle") {
        const k = state.fields["keys_handling"];
        holds = !!k && k.status === "filled" && keysLeftInVehicle(k.normalizedValue ?? k.value);
        evidence = k?.evidence[k.evidence.length - 1];
      } else if (rule.id === "min_vehicles_sold") {
        const v = state.fields["vehicles_sold_per_year"];
        const n = Number(v?.normalizedValue ?? v?.value);
        holds = v?.status === "filled" && Number.isFinite(n) && n < 15;
        evidence = v?.evidence[v.evidence.length - 1];
      } else if (rule.id === "min_owner_experience") {
        const e = state.fields["owner_experience_years"];
        const n = Number(e?.normalizedValue ?? e?.value);
        holds = e?.status === "filled" && Number.isFinite(n) && n < 3;
        evidence = e?.evidence[e.evidence.length - 1];
      } else if (rule.id === "plate_to_driver_ratio") {
        const p = state.fields["dealer_plate_count"];
        const plates = Number(p?.normalizedValue ?? p?.value);
        const namedDrivers = state.drivers.filter((d) => d.fields.driver_name?.status !== "missing").length;
        holds =
          p?.status === "filled" && Number.isFinite(plates) && namedDrivers > 0 && plates / namedDrivers > 3;
        evidence = p?.evidence[p.evidence.length - 1];
      }
    } else {
      holds = filledEquals(fs, rule.triggerValue);
      evidence = fs?.evidence[fs.evidence.length - 1];
    }

    if (!holds) continue;
    flags.push({
      id: `risk-${rule.id}`,
      ruleId: rule.id,
      label: rule.label,
      severity: rule.severity,
      fieldId: rule.fieldId,
      detected: true,
      resolved: prevResolved[rule.id] ?? false,
      evidence,
      recommendedAction: rule.recommendedAction,
      reason: rule.reason,
    });
  }

  // Per Harper University training: no complete driver record (full name,
  // DOB, license number) is an automatic decline, not just a missing field —
  // gated on business type so it doesn't fire before the call has even started.
  if (state.businessType && !state.drivers.some(isDriverComplete)) {
    flags.push({
      id: "risk-no_complete_driver",
      ruleId: "no_complete_driver",
      label: "No complete driver on file",
      severity: "knockout",
      detected: true,
      resolved: prevResolved["no_complete_driver"] ?? false,
      recommendedAction: "Get at least one driver's full name, date of birth, and license number — the application cannot be submitted without it.",
      reason: "Training material calls this the number one reason submissions get declined.",
    });
  }

  return flags;
}

export function detectSuggestedSupplements(
  state: IntakeState,
  previous: SuggestedSupplement[],
): SuggestedSupplement[] {
  const prevAck: Record<string, boolean> = {};
  for (const s of previous) prevAck[s.ruleId] = s.acknowledged;

  const suggestions: SuggestedSupplement[] = [];
  for (const rule of GARAGE_SUPPLEMENT_RULES) {
    let holds: boolean;
    if (rule.crossField) {
      if (rule.id === "heavy_vehicle_mix") {
        // Skip when the primary business-type rule already covers this form —
        // avoids two suggestion cards for the same GARAGE_SUP_007.
        const mixFs = state.fields["vehicle_mix_heavy_commercial_pct"];
        const mixPct = Number(mixFs?.normalizedValue ?? mixFs?.value);
        holds =
          state.businessType !== "heavy" &&
          mixFs?.status === "filled" &&
          Number.isFinite(mixPct) &&
          mixPct >= 10;
      } else if (rule.id === "wholesale_or_broker_pct") {
        // Skip when the coarse sales_model trigger already covers this form —
        // avoids two suggestion cards for the same GARAGE_SUP_022.
        const wholesaleFs = state.fields["sales_channel_wholesale_pct"];
        const brokerFs = state.fields["sales_channel_broker_pct"];
        const wholesalePct = Number(wholesaleFs?.normalizedValue ?? wholesaleFs?.value);
        const brokerPct = Number(brokerFs?.normalizedValue ?? brokerFs?.value);
        const wholesaleOver0 = wholesaleFs?.status === "filled" && wholesalePct > 0;
        const brokerOver0 = brokerFs?.status === "filled" && brokerPct > 0;
        const salesModelAlreadyWholesale = filledEquals(state.fields["sales_model"], "wholesale");
        holds = !salesModelAlreadyWholesale && (wholesaleOver0 || brokerOver0);
      } else {
        holds = false;
      }
    } else {
      holds =
        rule.fieldId === "business_type"
          ? state.businessType === rule.triggerValue
          : filledEquals(state.fields[rule.fieldId], rule.triggerValue);
    }
    if (!holds) continue;

    suggestions.push({
      id: `supplement-${rule.id}`,
      ruleId: rule.id,
      formId: rule.formId,
      filename: rule.filename,
      label: rule.label,
      fieldId: rule.fieldId,
      detected: true,
      acknowledged: prevAck[rule.id] ?? false,
      validated: rule.validated,
      reason: rule.reason,
    });
  }
  return suggestions;
}

// ---------------------------------------------------------------------------
// Next-best-question selection (strict priority order)
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<RiskFlag["severity"], number> = {
  knockout: 3,
  specialty_market: 2,
  appetite: 1,
  info: 0,
};

export function selectNextBestQuestion(state: IntakeState): {
  nextBestQuestion: NextBestQuestion;
  reasons: string[];
} {
  const reasons: string[] = [];

  // P1 — business type unknown.
  if (!state.businessType) {
    const step = GARAGE_TALK_TRACK.find((s) => s.id === "business_type_selector")!;
    reasons.push("Business type is unknown — it routes the whole call.");
    return {
      nextBestQuestion: {
        stepId: step.id,
        fieldIds: ["business_type"],
        question: step.question,
        whyWeAsk: step.whyWeAsk,
        priority: "high",
        reason: "No business type yet; this is the master switch for the rest of the intake.",
        category: "business_type",
      },
      reasons,
    };
  }

  // P2 — unresolved conflict.
  const conflicts = state.conflicts.filter((c) => !c.resolved);
  if (conflicts.length > 0) {
    const sorted = [...conflicts].sort(
      (a, b) => (FIELD_BY_ID[a.fieldId]?.priority ?? 999) - (FIELD_BY_ID[b.fieldId]?.priority ?? 999),
    );
    const c = sorted[0];
    const def = FIELD_BY_ID[c.fieldId];
    reasons.push(`Unresolved conflict on "${def?.label ?? c.fieldId}".`);
    return {
      nextBestQuestion: {
        fieldIds: [c.fieldId],
        question: `Quick check on ${def?.label.toLowerCase() ?? c.fieldId}: I first heard "${formatFieldValue(c.existingValue, def?.type)}", then "${formatFieldValue(c.newValue, def?.type)}". Which is correct?`,
        whyWeAsk: "Contradictions have to be resolved before the submission goes out.",
        priority: "high",
        reason: c.reason,
        category: "conflict_resolution",
      },
      reasons,
    };
  }

  // P3 — unresolved knockout / appetite / specialty risk flag.
  const risks = state.riskFlags
    .filter((f) => f.detected && !f.resolved && f.severity !== "info")
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  if (risks.length > 0) {
    const r = risks[0];
    reasons.push(`${r.severity.toUpperCase()} risk flag: ${r.label}.`);
    return {
      nextBestQuestion: {
        fieldIds: r.fieldId ? [r.fieldId] : undefined,
        question: r.recommendedAction,
        whyWeAsk: r.reason,
        priority: "high",
        reason: `${r.label} (${r.severity}).`,
        category: "risk_followup",
      },
      reasons,
    };
  }

  // P4 — first applicable talk-track step with a missing required/narrative field.
  const steps = getApplicableSteps(state.businessType);
  for (const step of steps) {
    if (step.id === "recap") continue;
    if (step.mapsToFields.length === 0) continue;
    if (!isStepSatisfied(step, state)) {
      reasons.push(`Talk-track step "${step.section}" still has a missing required field.`);
      return {
        nextBestQuestion: {
          stepId: step.id,
          fieldIds: step.mapsToFields,
          question: step.question,
          whyWeAsk: step.whyWeAsk,
          priority: "medium",
          reason: `Next unanswered step in the ${step.section} section.`,
          category: "talk_track_missing_field",
        },
        reasons,
      };
    }
  }

  // P5 — low-confidence / needs-review confirmations.
  const toConfirm = getApplicableFieldDefinitions(state.businessType)
    .filter((def) => dependenciesSatisfied(def, state))
    .filter((def) => {
      const st = state.fields[def.id]?.status;
      return st === "needs_review" || st === "low_confidence";
    })
    .sort((a, b) => a.priority - b.priority);
  if (toConfirm.length > 0) {
    const def = toConfirm[0];
    const fs = state.fields[def.id];
    reasons.push(`Field "${def.label}" needs confirmation (${fs.status}).`);
    return {
      nextBestQuestion: {
        fieldIds: [def.id],
        question: `Just to confirm — ${def.question}`,
        whyWeAsk: def.whyWeAsk,
        priority: "medium",
        reason: `Heard "${formatFieldValue(fs.value, def.type)}" but confidence is ${Math.round(fs.confidence * 100)}%.`,
        category: "low_confidence",
      },
      reasons,
    };
  }

  // P6 — recap / wrap.
  const recap = GARAGE_TALK_TRACK.find((s) => s.id === "recap")!;
  reasons.push("All required fields for this business type are complete.");
  return {
    nextBestQuestion: {
      stepId: recap.id,
      question: recap.question,
      whyWeAsk: recap.whyWeAsk,
      priority: "low",
      reason: "Nothing outstanding — recap and set expectations.",
      category: "recap",
    },
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Recompute all derived state + next question
// ---------------------------------------------------------------------------

export function recompute(state: IntakeState): {
  state: IntakeState;
  nextBestQuestion: NextBestQuestion;
  reasons: string[];
} {
  const conflicts = Object.values(state.fields)
    .map((f) => f.conflict)
    .filter((c): c is ConflictRecord => !!c && !c.resolved);

  const withoutQuestion: IntakeState = {
    ...state,
    conflicts,
    missingRequiredFieldIds: computeMissingRequiredFields(state),
    completedStepIds: computeCompletedSteps(state),
    riskFlags: detectRiskFlags(state, state.riskFlags),
    suggestedSupplements: detectSuggestedSupplements(state, state.suggestedSupplements),
    recommendedCoverageLines: getRecommendedCoverageLines(state.businessType),
    updatedAt: new Date().toISOString(),
  };
  const withValidation: IntakeState = {
    ...withoutQuestion,
    validationIssues: detectValidationIssues(withoutQuestion),
  };

  const { nextBestQuestion, reasons } = selectNextBestQuestion(withValidation);
  return { state: withValidation, nextBestQuestion, reasons };
}

// ---------------------------------------------------------------------------
// Top-level: process one extraction result against current state
// ---------------------------------------------------------------------------

export function processExtraction(
  state: IntakeState,
  extraction: ExtractionResult,
  chunk: TranscriptChunk,
): { state: IntakeState; nextBestQuestion: NextBestQuestion; reasons: string[] } {
  let next = appendTranscriptChunk(state, chunk);
  next = mergeExtractedFields(next, extraction.extractedFields, chunk);
  next = mergeDriverCandidates(next, extraction.driverFields ?? [], chunk);

  // Derive business type from the explicit signal or an extracted business_type field.
  const explicitBt = extraction.extractedFields.find((c) => c.fieldId === "business_type");
  const potential =
    extraction.potentialBusinessType ??
    (explicitBt ? (normalizeCandidate(FIELD_BY_ID["business_type"], explicitBt.value) as GarageBusinessType) : null);
  const btConf = extraction.businessTypeConfidence ?? explicitBt?.confidence;
  next = applyBusinessType(next, potential, btConf);

  next = { ...next, generation: next.generation + 1 };
  return recompute(next);
}

// Replaces an existing chunk's text in place (rather than appending a new chunk) —
// used when a rep fixes what ASR actually heard. Keeps the first-ever original text,
// so re-correcting a chunk twice doesn't lose what ASR originally produced.
export function replaceTranscriptChunkText(
  state: IntakeState,
  chunkId: string,
  correctedText: string,
): { state: IntakeState; chunk: TranscriptChunk } | null {
  const idx = state.transcriptChunks.findIndex((c) => c.id === chunkId);
  if (idx === -1) return null;

  const original = state.transcriptChunks[idx];
  const updatedChunk: TranscriptChunk = {
    ...original,
    text: correctedText.trim(),
    originalText: original.originalText ?? original.text,
  };
  const transcriptChunks = [...state.transcriptChunks];
  transcriptChunks[idx] = updatedChunk;
  return { state: { ...state, transcriptChunks }, chunk: updatedChunk };
}

// Same merge pipeline as processExtraction, but against a corrected existing chunk
// instead of a newly-appended one — the corrected text becomes the authoritative
// version of what was said, so any fields the bad transcription broke get fixed here
// too, not just logged as a training signal.
export function processTranscriptCorrection(
  state: IntakeState,
  chunkId: string,
  correctedText: string,
  extraction: ExtractionResult,
): { state: IntakeState; nextBestQuestion: NextBestQuestion; reasons: string[] } | null {
  const replaced = replaceTranscriptChunkText(state, chunkId, correctedText);
  if (!replaced) return null;

  let next = mergeExtractedFields(replaced.state, extraction.extractedFields, replaced.chunk);
  next = mergeDriverCandidates(next, extraction.driverFields ?? [], replaced.chunk);

  const explicitBt = extraction.extractedFields.find((c) => c.fieldId === "business_type");
  const potential =
    extraction.potentialBusinessType ??
    (explicitBt ? (normalizeCandidate(FIELD_BY_ID["business_type"], explicitBt.value) as GarageBusinessType) : null);
  const btConf = extraction.businessTypeConfidence ?? explicitBt?.confidence;
  next = applyBusinessType(next, potential, btConf);

  next = { ...next, generation: next.generation + 1 };
  return recompute(next);
}

// ---------------------------------------------------------------------------
// Rep actions (deterministic, no LLM) — these close the conflict/review loops
// ---------------------------------------------------------------------------

export function resolveConflict(
  state: IntakeState,
  fieldId: string,
  choice: "new" | "old" | "manual",
  manualValue?: unknown,
): { state: IntakeState; nextBestQuestion: NextBestQuestion; reasons: string[] } {
  const def = FIELD_BY_ID[fieldId];
  const fs = { ...state.fields[fieldId] };
  const conflict = fs.conflict;
  if (!def || !conflict) return recompute(state);

  const chosen =
    choice === "new" ? conflict.newValue : choice === "old" ? conflict.existingValue : manualValue;
  fs.value = chosen;
  fs.normalizedValue = normalizeCandidate(def, chosen);
  fs.status = "filled";
  fs.confirmed = true;
  fs.bestConfidence = Math.max(fs.bestConfidence, 0.95);
  fs.confidence = 0.95;
  fs.needsReviewReason = undefined;
  fs.conflict = { ...conflict, resolved: true };
  fs.lastUpdatedAt = new Date().toISOString();
  // Clear the active conflict marker so the field leaves the conflict state.
  fs.conflict = undefined;

  const fields = { ...state.fields, [fieldId]: fs };
  return recompute({ ...state, fields });
}

// Rep manually overrides a value (any field, any time). Empty clears the field.
export function editField(
  state: IntakeState,
  fieldId: string,
  rawValue: unknown,
): { state: IntakeState; nextBestQuestion: NextBestQuestion; reasons: string[] } {
  const def = FIELD_BY_ID[fieldId];
  const fs = { ...state.fields[fieldId] };
  if (!def) return recompute(state);

  const normalized = normalizeCandidate(def, rawValue);
  if (isEmptyValue(normalized) && def.type !== "boolean") {
    // Clear the field back to missing.
    fs.value = null;
    fs.normalizedValue = null;
    fs.status = "missing";
    fs.confirmed = false;
    fs.confidence = 0;
    fs.conflict = undefined;
    fs.needsReviewReason = undefined;
  } else {
    fs.value = rawValue;
    fs.normalizedValue = normalized;
    fs.status = "filled";
    fs.confirmed = true;
    fs.everSeen = true;
    fs.bestConfidence = 1;
    fs.confidence = 1;
    fs.conflict = undefined;
    fs.needsReviewReason = undefined;
    const manualEvidence: EvidenceSnippet = {
      transcriptChunkId: "manual",
      quote: `Rep entered: ${String(rawValue)}`,
      speaker: "agent",
    };
    fs.evidence = [...fs.evidence, manualEvidence].slice(-4);
  }
  fs.lastUpdatedAt = new Date().toISOString();
  const fields = { ...state.fields, [fieldId]: fs };
  return recompute({ ...state, fields });
}

export function confirmField(
  state: IntakeState,
  fieldId: string,
): { state: IntakeState; nextBestQuestion: NextBestQuestion; reasons: string[] } {
  const fs = { ...state.fields[fieldId] };
  if (!fs) return recompute(state);
  fs.confirmed = true;
  fs.status = "filled";
  fs.bestConfidence = Math.max(fs.bestConfidence, AUTO_FILL_THRESHOLD);
  fs.needsReviewReason = undefined;
  fs.lastUpdatedAt = new Date().toISOString();
  const fields = { ...state.fields, [fieldId]: fs };
  return recompute({ ...state, fields });
}

export function acknowledgeRisk(
  state: IntakeState,
  ruleId: string,
): { state: IntakeState; nextBestQuestion: NextBestQuestion; reasons: string[] } {
  const riskFlags = state.riskFlags.map((f) =>
    f.ruleId === ruleId ? { ...f, resolved: true } : f,
  );
  return recompute({ ...state, riskFlags });
}

export function acknowledgeSupplement(
  state: IntakeState,
  ruleId: string,
): { state: IntakeState; nextBestQuestion: NextBestQuestion; reasons: string[] } {
  const suggestedSupplements = state.suggestedSupplements.map((s) =>
    s.ruleId === ruleId ? { ...s, acknowledged: true } : s,
  );
  return recompute({ ...state, suggestedSupplements });
}
