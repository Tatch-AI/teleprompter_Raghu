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

export interface SuggestedSupplement {
  id: string;
  ruleId: string;
  formId: string;
  filename: string;
  label: string;
  fieldId: string;
  detected: boolean;
  acknowledged: boolean;
  validated: boolean;
  reason: string;
}

export type GarageCoverageLine = "garage_liability" | "garage_keepers" | "dealers_physical_damage";

export interface CoverageLineRecommendation {
  line: GarageCoverageLine;
  reason: string;
}

export type ValidationSeverity = "error" | "warning";

// Cross-field checks — distinct from a single field's status. A field can be
// individually `filled` and still participate in a validation error (e.g. a
// vehicle-mix percentage that's filled but the group doesn't sum to 100).
export interface ValidationIssue {
  id: string;
  ruleId: string;
  severity: ValidationSeverity;
  label: string;
  message: string;
  fieldIds: string[];
}

// One driver on the schedule. Reuses FieldState per sub-field (not a raw JSON
// blob) so a driver's name/DOB/license get the same status/confidence/
// evidence/conflict tracking as every other field in the application —
// see futurescope.md item 1 for why a flat object would be a regression.
export interface DriverRecord {
  id: string;
  fields: Record<string, FieldState>;
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
  /** Driver schedule. Minimal version: supports one driver (drivers[0]). */
  drivers: DriverRecord[];
  missingRequiredFieldIds: string[];
  conflicts: ConflictRecord[];
  riskFlags: RiskFlag[];
  suggestedSupplements: SuggestedSupplement[];
  recommendedCoverageLines: CoverageLineRecommendation[];
  validationIssues: ValidationIssue[];
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
  /** Driver-schedule candidates — merged into drivers[0], not state.fields. */
  driverFields?: ExtractedFieldCandidate[];
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

export type CorrectionAction = "accept" | "edit" | "resolve_conflict";

// One human touch on a field. Corrections (changed=true) are the high-value
// training signal; accepts (changed=false) confirm the machine got it right.
export interface FeedbackEvent {
  id: string;
  intakeId: string;
  fieldId: string;
  fieldLabel: string;
  action: CorrectionAction;
  machineValue: unknown;
  correctedValue: unknown;
  changed: boolean;
  machineConfidence: number;
  /** Which extractor produced machineValue — mock confidences are hand-set heuristics, not calibrated probabilities, so this must stay separable from llm confidences in analysis. */
  extractorMode: "llm" | "mock" | null;
  businessType: GarageBusinessType | null;
  evidenceQuote?: string;
  createdAt: string;
}

// One extraction candidate as it came out of a single extraction pass, before
// any human touched it. Append-only — unlike FieldState, this preserves every
// pass over a field, not just the latest, so confidence calibration can be
// measured against the full extraction history rather than a single snapshot.
export interface ExtractionEvent {
  id: string;
  intakeId: string;
  chunkId: string;
  fieldId: string;
  value: unknown;
  normalizedValue?: unknown;
  confidence: number;
  evidenceQuote: string;
  extractorMode: "llm" | "mock";
  businessType: GarageBusinessType | null;
  createdAt: string;
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
