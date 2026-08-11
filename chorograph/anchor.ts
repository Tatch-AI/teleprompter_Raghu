// CHOROGRAPH-ANCHOR: shared/stub declarations only. Merged estate-wide by chorograph --anchors.
//
// This file lets `npx chorograph render .` pass inside this repo alone. When the whole
// Tatch-AI estate is rendered as one map, every repo's anchor.ts is deleted and replaced by a
// single master anchor, so nothing here may declare a node this repo actually owns — owned
// nodes live in chorograph/architecture.ts.

/**
 * Harper is an AI-forward commercial insurance brokerage. Revenue is commission on placed
 * premium; the platform runs the funnel from lead acquisition through intake, quoting and
 * placement, binding, payment, post-bind servicing, and renewal.
 * @system Harper
 */

/**
 * Intake: voice agents, call tooling, Dumbly suite, and copilots that turn live conversations
 * into structured submission data during the agent-on-a-call workflow.
 * @domain Intake
 */

/**
 * Structured field extraction from live call transcript chunks via OpenAI Chat Completions.
 * @external OpenAI in:Intake
 */

/**
 * Live streaming speech-to-text with diarization for mic and call-recording replay during
 * intake calls.
 * @external Deepgram in:Intake
 */
