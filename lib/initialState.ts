import { IntakeState } from "./types";
import { GARAGE_FIELD_DEFINITIONS } from "./garageFieldDefinitions";

export function createInitialIntakeState(): IntakeState {
  const fields: IntakeState["fields"] = {};

  for (const def of GARAGE_FIELD_DEFINITIONS) {
    fields[def.id] = {
      fieldId: def.id,
      value: null,
      normalizedValue: null,
      status: "missing",
      confidence: 0,
      bestConfidence: 0,
      everSeen: false,
      confirmed: false,
      evidence: [],
    };
  }

  return {
    intakeId: `intake-${Date.now()}`,
    vertical: "garage",
    formId: "GARAGE_001",
    businessType: null,
    businessTypeConfidence: 0,
    transcriptChunks: [],
    fields,
    // Business-type-aware; recomputed on every chunk by the engine.
    missingRequiredFieldIds: GARAGE_FIELD_DEFINITIONS.filter((f) => f.required && f.businessTypes === "everyone").map(
      (f) => f.id,
    ),
    conflicts: [],
    riskFlags: [],
    completedStepIds: [],
    generation: 0,
    updatedAt: new Date().toISOString(),
  };
}
