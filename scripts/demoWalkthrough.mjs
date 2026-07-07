// Drives the scripted demo conversation through /api/process-chunk and prints
// the resulting engine state at each step. Run with the dev/prod server up:
//   node scripts/demoWalkthrough.mjs
const chunks = [
  "We're Valley Auto Sales LLC, mainly a used car dealer in Fresno. We sell to the public, mostly used sedans and small SUVs.",
  "We've been open about three years, but I've been in the car business for twelve years. We're an LLC.",
  "We sell around 180 vehicles a year. Revenue is about 2.4 million. No repair work, just sales.",
  "We have three dealer plates, and no, we never rent or loan them out.",
  "We do allow test drives. We check the customer's license, but we don't always ride along.",
  "Actually, we have four dealer plates now, not three.",
  "We keep keys in a locked cabinet in the office after hours. The lot is fenced and has cameras.",
  "We're currently insured with Progressive. No claims in the last three years.",
];

const base = process.env.BASE_URL ?? "http://localhost:3000";
let state = null;

for (let i = 0; i < chunks.length; i++) {
  const res = await fetch(`${base}/api/process-chunk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcriptChunkText: chunks[i], speaker: "customer", currentState: state }),
  });
  const data = await res.json();
  state = data.updatedState;
  const nq = data.nextBestQuestion;
  const fields = Object.values(state.fields)
    .filter((f) => f.everSeen)
    .map((f) => `${f.fieldId}=${JSON.stringify(f.value)}[${f.status}]`);
  console.log(`\n=== CHUNK ${i + 1} (mode=${data.extractorMode}) ===`);
  console.log("businessType:", state.businessType);
  console.log("fields:", fields.join(", "));
  console.log(
    "conflicts:",
    state.conflicts.map((c) => `${c.fieldId}: ${c.existingValue}->${c.newValue}`).join("; ") || "none",
  );
  console.log(
    "riskFlags:",
    state.riskFlags.map((r) => `${r.ruleId}(${r.severity},resolved=${r.resolved})`).join("; ") || "none",
  );
  console.log("ASK NEXT:", `[${nq.category}/${nq.priority}]`, nq.question.slice(0, 90));
}

console.log("\n### FINAL missingRequired:", state.missingRequiredFieldIds.join(", "));
console.log("### completedSteps:", state.completedStepIds.join(", "));
