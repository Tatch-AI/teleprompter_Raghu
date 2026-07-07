export interface MockTranscriptChunk {
  speaker: "agent" | "customer";
  text: string;
}

// Scripted demo conversation. Chunks arrive out of talk-track order on purpose
// to show opportunistic autofill, a knockout flag, and a conflict + resolution.
export const MOCK_TRANSCRIPT_CHUNKS: MockTranscriptChunk[] = [
  {
    speaker: "customer",
    text: "We're Valley Auto Sales LLC, mainly a used car dealer in Fresno. We sell to the public, mostly used sedans and small SUVs.",
  },
  {
    speaker: "customer",
    text: "We've been open about three years, but I've been in the car business for twelve years. We're an LLC.",
  },
  {
    speaker: "customer",
    text: "We sell around 180 vehicles a year. Revenue is about 2.4 million. No repair work, just sales.",
  },
  {
    speaker: "customer",
    text: "We have three dealer plates, and no, we never rent or loan them out.",
  },
  {
    speaker: "customer",
    text: "We do allow test drives. We check the customer's license, but we don't always ride along.",
  },
  {
    speaker: "customer",
    text: "Actually, we have four dealer plates now, not three.",
  },
  {
    speaker: "customer",
    text: "We keep keys in a locked cabinet in the office after hours. The lot is fenced and has cameras.",
  },
  {
    speaker: "customer",
    text: "We're currently insured with Progressive. No claims in the last three years.",
  },
];
