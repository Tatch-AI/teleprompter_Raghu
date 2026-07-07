// Core data model for the Garage Intake Teleprompter + Application Autofill copilot.
//
// Design contract (hardened during review):
// - The LLM ONLY extracts candidate facts with evidence. It never sets status,
//   never selects the next question, never marks a field complete.
// - Deterministic TypeScript owns: normalization, status, conflicts, risk flags,
//   missing-field computation, talk-track satisfaction, and next-question selection.

export type FieldStatus =
  | "missing" // never seen / no data
  | "low_confidence" // extracted, but below the review threshold
  | "needs_review" // extracted in the review band; awaits rep confirmation
  | "filled" // confirmed / high confidence
  | "conflict"; // two contradictory values; awaits resolution

export type GarageBusinessType =
  | "dealer"
  | "dealer_plus_repair"
  | "repair"
  | "body"
  | "heavy"
  | "tow"
  | "parking"
  | "car_wash"
  | "mixed";

export type FieldSection =
  | "business_identity"
  | "location"
  | "operations"
  | "coverage_intent"
  | "underwriting_risk"
  | "drivers_team"
  | "premises"
  | "vehicles_driving"
  | "history"
  | "online_verification";

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "address"
  | "phone"
  | "email"
  | "currency"
  | "date"
  | "array";

export interface EvidenceSnippet {
  transcriptChunkId: string;
  quote: string;
  speaker?: "agent" | "customer" | "unknown";
}

export interface FieldDependency {
  fieldId: string;
  operator: "equals" | "not_equals" | "exists";
  value?: unknown;
}

export interface FieldDefinition {
  id: string;
  label: string;
  section: FieldSection;
  type: FieldType;
  required: boolean;
  /** Free-text / conversational fields are "done" on any non-empty extraction. */
  narrative?: boolean;
  priority: number;
  description: string;
  question: string;
  whyWeAsk: string;
  businessTypes: GarageBusinessType[] | "everyone";
  options?: string[];
  dependencies?: FieldDependency[];
}

export interface ConflictRecord {
  id: string;
  fieldId: string;
  existingValue: unknown;
  newValue: unknown;
  existingEvidence?: EvidenceSnippet;
  newEvidence?: EvidenceSnippet;
  reason: string;
  resolved: boolean;
}

export interface FieldState {
  fieldId: string;
  value: unknown | null;
  normalizedValue?: unknown | null;
  status: FieldStatus;
  confidence: number;
  /** Highest confidence ever seen for this field — filled never downgrades. */
  bestConfidence: number;
  /** True once any extraction has produced a candidate for this field. */
  everSeen: boolean;
  /** True once the rep has explicitly confirmed the value. */
  confirmed: boolean;
  evidence: EvidenceSnippet[];
  lastUpdatedAt?: string;
  conflict?: ConflictRecord;
  needsReviewReason?: string;
}

export interface TranscriptChunk {
  id: string;
  text: string;
  speaker?: "agent" | "customer" | "unknown";
  createdAt: string;
}

export interface RiskFlag {
  id: string;
  ruleId: string;
  label: string;
  severity: "info" | "appetite" | "knockout" | "specialty_market";
  fieldId?: string;
  detected: boolean;
  resolved: boolean;
  evidence?: EvidenceSnippet;
  recommendedAction: string;
  reason: string;
}

export interface IntakeState {
  intakeId: string;
  vertical: "garage";
  formId: "GARAGE_001";
  businessType: GarageBusinessType | null;
  /** Confidence with which businessType was set — used for sticky flip logic. */
  businessTypeConfidence: number;
  transcriptChunks: TranscriptChunk[];
  fields: Record<string, FieldState>;
  missingRequiredFieldIds: string[];
  conflicts: ConflictRecord[];
  riskFlags: RiskFlag[];
  completedStepIds: string[];
  /** Monotonic counter; stale responses are dropped by the client. */
  generation: number;
  updatedAt: string;
}

export interface TalkTrackStep {
  id: string;
  section: string;
  businessTypes: GarageBusinessType[] | "everyone";
  question: string;
  whyWeAsk: string;
  knockout?: string;
  mapsToFields: string[];
  riskRuleIds?: string[];
}

export interface ExtractedFieldCandidate {
  fieldId: string;
  value: unknown;
  normalizedValue?: unknown;
  confidence: number;
  evidenceQuote: string;
  reasoning: string;
}

export interface ExtractionResult {
  extractedFields: ExtractedFieldCandidate[];
  potentialBusinessType?: GarageBusinessType | null;
  businessTypeConfidence?: number;
  potentialConflicts: {
    fieldId: string;
    newValue: unknown;
    evidenceQuote: string;
    reason: string;
  }[];
  riskSignals: {
    riskRuleId: string;
    detected: boolean;
    confidence: number;
    evidenceQuote: string;
    reason: string;
  }[];
  unprocessedNotes: string[];
}

export type NextQuestionCategory =
  | "business_type"
  | "conflict_resolution"
  | "risk_followup"
  | "talk_track_missing_field"
  | "low_confidence"
  | "recap";

export interface NextBestQuestion {
  stepId?: string;
  fieldIds?: string[];
  question: string;
  whyWeAsk?: string;
  priority: "high" | "medium" | "low";
  reason: string;
  category: NextQuestionCategory;
}

export interface ProcessChunkRequest {
  transcriptChunkText: string;
  speaker?: "agent" | "customer" | "unknown";
  currentState: IntakeState;
}

export interface ProcessChunkResponse {
  updatedState: IntakeState;
  nextBestQuestion: NextBestQuestion;
  reasons: string[];
  extractorMode: "llm" | "mock";
}
