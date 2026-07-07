// Eval, not a test: replays each demo transcript through the deterministic mock
// extractor + engine, and for every chunk records what Ask-Next was actively asking
// for *before* that chunk arrived vs. what fields the chunk actually delivered.
// A "volunteered" chunk (fields land that Ask-Next wasn't currently pointing at)
// means the caller supplied that information unprompted — evidence the scripted
// question for it may be redundant for how real calls actually flow. A chunk that
// matches the active question is the talk track doing real work.
//
// Run: npx tsx scripts/evalTalkTrack.ts

import { createInitialIntakeState } from "../lib/initialState";
import { mockExtract } from "../lib/llmExtraction";
import { processExtraction } from "../lib/rules";
import { GARAGE_TALK_TRACK } from "../lib/garageTalkTrack";
import { DEMO_TRANSCRIPTS } from "../lib/mockTranscript";
import { IntakeState, NextBestQuestion } from "../lib/types";

const STEP_BY_FIELD: Record<string, string> = {};
for (const step of GARAGE_TALK_TRACK) {
  for (const f of step.mapsToFields) STEP_BY_FIELD[f] = step.id;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

for (const demo of DEMO_TRANSCRIPTS) {
  console.log(`\n=== ${demo.label} (${demo.id}) ===`);
  let state: IntakeState = createInitialIntakeState();
  let nextQuestion: NextBestQuestion | null = null;
  let volunteered = 0;
  let onPrompt = 0;
  let noExtraction = 0;

  for (let i = 0; i < demo.chunks.length; i++) {
    const chunk = demo.chunks[i];
    const activeStepId = nextQuestion?.stepId;
    const activeStepFields =
      GARAGE_TALK_TRACK.find((s) => s.id === activeStepId)?.mapsToFields ?? [];

    const extraction = mockExtract(state, chunk.text);
    const fieldIds = extraction.extractedFields.map((f) => f.fieldId);

    const result = processExtraction(
      state,
      extraction,
      { id: `evalchunk-${i}`, text: chunk.text, speaker: chunk.speaker, createdAt: new Date(0).toISOString() },
    );
    state = result.state;
    nextQuestion = result.nextBestQuestion;

    let verdict: string;
    if (fieldIds.length === 0) {
      verdict = "no extraction";
      noExtraction++;
    } else if (activeStepFields.length > 0 && fieldIds.some((f) => activeStepFields.includes(f))) {
      verdict = "on-prompt";
      onPrompt++;
    } else {
      verdict = "volunteered";
      volunteered++;
    }

    console.log(
      `  [${i}] ${chunk.speaker.padEnd(8)} asked=${(activeStepId ?? "-").padEnd(24)} got=${(fieldIds.join(",") || "-").padEnd(30)} ${verdict}`,
    );
    console.log(`        "${truncate(chunk.text, 90)}"`);
  }

  console.log(
    `  -- on-prompt=${onPrompt} volunteered=${volunteered} no-extraction=${noExtraction} (of ${demo.chunks.length} chunks)`,
  );
}
