import { CorrectionAction, FeedbackEvent, IntakeState } from "./types";
import { FIELD_BY_ID } from "./garageFieldDefinitions";
import { valuesEquivalent } from "./rules";

// Builds a feedback event from the state BEFORE the human action plus the value
// they landed on. `machineValue` is what the extractor had proposed.
export function buildFeedbackEvent(
  before: IntakeState,
  fieldId: string,
  action: CorrectionAction,
  correctedValue: unknown,
  extractorMode: "llm" | "mock" | null,
): FeedbackEvent | null {
  const def = FIELD_BY_ID[fieldId];
  const fs = before.fields[fieldId];
  if (!def || !fs) return null;

  const machineValue =
    action === "resolve_conflict" ? fs.conflict?.existingValue ?? fs.value : fs.value;
  const changed = !valuesEquivalent(
    def.type === "boolean" ? machineValue : machineValue ?? null,
    def.type === "boolean" ? correctedValue : correctedValue ?? null,
    def.type,
  );

  return {
    id: `fb-${fieldId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    intakeId: before.intakeId,
    fieldId,
    fieldLabel: def.label,
    action,
    machineValue,
    correctedValue,
    changed,
    machineConfidence: fs.confidence,
    extractorMode,
    businessType: before.businessType,
    evidenceQuote: fs.evidence[fs.evidence.length - 1]?.quote,
    createdAt: new Date().toISOString(),
  };
}

// Fire-and-forget persistence to the server-side JSONL store.
export async function persistFeedback(event: FeedbackEvent): Promise<void> {
  try {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    /* non-blocking: local UI still shows the event */
  }
}
