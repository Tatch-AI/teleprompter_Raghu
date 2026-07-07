import { GARAGE_FIELD_DEFINITIONS } from "./garageFieldDefinitions";

// Deepgram's nova-2 model supports keyword boosting via the `keywords` query
// param (`term:intensifier`) to bias the ASR model toward domain vocabulary
// it would otherwise mishear against everyday speech. Two sources, both
// grounded in what the engine actually matches on rather than invented:
//   1. Every enum option in the field catalog — these are the exact strings
//      the extractor/rules engine compares against, so a mis-heard "wholesale"
//      silently breaks a downstream rule with no visible error.
//   2. A short list of compound insurance/garage terms already referenced
//      elsewhere in the codebase (risk rules, field descriptions) that are
//      rare enough for general ASR to mangle.
const ENUM_TERMS: string[] = Array.from(
  new Set(
    GARAGE_FIELD_DEFINITIONS.flatMap((def) => (def.type === "enum" ? def.options ?? [] : [])),
  ),
);

// intensifier: modest boost for common category words, higher for rarer
// compound phrases more likely to be misheard outright.
const DOMAIN_TERMS: { term: string; intensifier: number }[] = [
  { term: "buy-here-pay-here", intensifier: 3 },
  { term: "garagekeepers", intensifier: 3 },
  { term: "repossession", intensifier: 2 },
  { term: "repossess", intensifier: 2 },
  { term: "ride-along", intensifier: 2 },
  { term: "dealer plate", intensifier: 2 },
  { term: "dealer plates", intensifier: 2 },
  { term: "lot security", intensifier: 2 },
];

export function getGarageKeyterms(): { term: string; intensifier: number }[] {
  return [
    ...ENUM_TERMS.map((term) => ({ term, intensifier: 2 })),
    ...DOMAIN_TERMS,
  ];
}
