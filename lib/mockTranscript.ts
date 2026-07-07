export interface MockTranscriptChunk {
  speaker: "agent" | "customer";
  text: string;
}

export interface DemoTranscript {
  id: string;
  label: string;
  description: string;
  chunks: MockTranscriptChunk[];
}

// Scripted demo #1. Chunks arrive out of talk-track order on purpose to show
// opportunistic autofill, a knockout flag, and a conflict + resolution.
export const VALLEY_AUTO_CHUNKS: MockTranscriptChunk[] = [
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

// Scripted demo #2. Condensed from a real Harper Insurance intake call
// (Dexter's Auto LLC, Arkansas used-car dealer). Turns are kept close to the
// real dialogue but tightened so the deterministic mock extractor can read them.
// This call naturally exercises: a coverage-type clarification (garage keepers
// vs. general liability), a revenue conflict ($35 -> $35,000), a dealer-plate
// conflict (two -> three), and a self-repossession-without-BHPH specialty flag.
export const DEXTERS_AUTO_CHUNKS: MockTranscriptChunk[] = [
  {
    speaker: "customer",
    text: "Mainly I run a used car dealership in Arkansas. I need coverage for the dealership license and for the cars on the lot.",
  },
  {
    speaker: "customer",
    text: "The only cars I work on are mine, like if I go to the auction and buy one. Not anyone else's cars.",
  },
  {
    speaker: "agent",
    text: "So just general liability for the dealership, not garage keepers. Got it.",
  },
  {
    speaker: "agent",
    text: "Your business name is Dexter's Auto LLC, you've been in business for eight years, and it's just you, no other staff.",
  },
  {
    speaker: "customer",
    text: "My revenue is $35.",
  },
  {
    speaker: "customer",
    text: "Sorry, I mean my revenue is 35,000 for the year.",
  },
  {
    speaker: "customer",
    text: "It's 100% retail to the public, all passenger vehicles, and no consignment. Everybody comes in.",
  },
  {
    speaker: "customer",
    text: "I have two dealer plates.",
  },
  {
    speaker: "agent",
    text: "Okay, so three dealer plates now, not two.",
  },
  {
    speaker: "customer",
    text: "I finance through Credit Acceptance, so no buy here pay here.",
  },
  {
    speaker: "customer",
    text: "I do repossess vehicles I sell myself, if I have to. And titles transfer promptly within state guidelines.",
  },
  {
    speaker: "customer",
    text: "I do test drives and ride along, and I check the customer's license first. I never let a car go overnight.",
  },
  {
    speaker: "customer",
    text: "None of my cars are used for Uber or Lyft, and I don't rent or loan the plates out.",
  },
  {
    speaker: "customer",
    text: "The lot is open, not fenced or gated. I keep the keys in a lockbox in the office.",
  },
  {
    speaker: "agent",
    text: "For the general liability we'll do the Arkansas state minimum of $75,000 with a $1,000 deductible.",
  },
  {
    speaker: "customer",
    text: "I figure I'll sell maybe ten cars a year. I'm just shopping to find something cheaper than what I had before.",
  },
];

export const DEMO_TRANSCRIPTS: DemoTranscript[] = [
  {
    id: "valley_auto",
    label: "Valley Auto Sales",
    description: "Clean used-car dealer call with a plate-count conflict and a ride-along knockout.",
    chunks: VALLEY_AUTO_CHUNKS,
  },
  {
    id: "dexters_auto",
    label: "Dexter's Auto (real call)",
    description:
      "Condensed real Harper intake: coverage-type mix-up, revenue conflict, and a self-repo specialty flag.",
    chunks: DEXTERS_AUTO_CHUNKS,
  },
];

// Backwards-compatible default demo used by the walkthrough script.
export const MOCK_TRANSCRIPT_CHUNKS = VALLEY_AUTO_CHUNKS;
