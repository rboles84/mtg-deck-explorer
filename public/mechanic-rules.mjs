import {MECHANIC_EXPLANATIONS} from './mechanic-explanations.mjs';
import {EXPLANATORY_RULES} from './mechanic-rule-clauses.mjs';
import {ADDITIONAL_RULE_LINKS} from './mechanic-reference-supplement.mjs';
// Definition links only: these do not detect card behavior or authorize searches.
// Reviewed against the retained September 25, 2026 rules headings and clauses.
export const RULES_REVISION = Object.freeze({
  date: '2026-09-25',
  sourceUrl: 'https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt',
  sourceSha256: '8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca',
});
export const MECHANIC_RULE_LINKS = Object.freeze({
  "scry": "701.22",
  "enchant": "702.5",
  "cycling": "702.29",
  "flashback": "702.34",
  "cumulative upkeep": "702.24",
  "double": "701.10",
  "protection": "702.16",
  "manifest": "701.40",
  "overload": "702.96",
  "partner": "702.124",
  "affinity": "702.41",
  "regenerate": "701.19",
  "defender": "702.3",
  "fear": "702.36",
  "foretell": "702.143",
  "encore": "702.141",
  "gift": "702.174",
  "hexproof": "702.11",
  "ascend": "702.131",
  "cascade": "702.85",
  "hideaway": "702.75",
  "kicker": "702.33",
  "prowess": "702.108",
  "spree": "702.172",
  "transmute": "702.53",
  "morph": "702.37",
  "investigate": "701.16",
  "infect": "702.90",
  "evoke": "702.74",
  "toxic": "702.164",
  "annihilator": "702.86",
  "ninjutsu": "702.49",
  "boast": "702.142",
  "compleated": "702.150",
  "connive": "701.50",
  "exalted": "702.83",
  "improvise": "702.126",
  "myriad": "702.116",
  "vanishing": "702.63",
  "companion": "702.139",
  "dethrone": "702.105",
  "extort": "702.101",
  "banding": "702.22",
  "manifest dread": "701.62",
  "discover": "701.57",
  "explore": "701.44",
  "landwalk": "702.14",
  "power-up": "702.193",
  "behold": "701.4",
  "bestow": "702.103",
  "buyback": "702.27",
  "dash": "702.109",
  "delve": "702.66",
  "demonstrate": "702.144",
  "detain": "701.35",
  "devoid": "702.114",
  "disguise": "702.168",
  "escalate": "702.120",
  "escape": "702.138",
  "exert": "701.43",
  "fabricate": "702.123",
  "firebending": "702.189",
  "heal": "701.69",
  "living weapon": "702.92",
  "mutate": "702.140",
  "phasing": "702.26",
  "plot": "702.170",
  "provoke": "702.39",
  "rampage": "702.23",
  "rebound": "702.88",
  "splice": "702.47",
  "storm": "702.40",
  "triple": "701.11",
  "venture into the dungeon": "701.49",
  "warp": "702.185",
  adapt: '701.46', changeling: '702.73', convoke: '702.51', crew: '702.122',
  deathtouch: '702.2', 'double strike': '702.4', equip: '702.6', evolve: '702.100',
  fight: '701.14', 'first strike': '702.7', flash: '702.8', flying: '702.9',
  haste: '702.10', indestructible: '702.12', lifelink: '702.15', mayhem: '702.187', menace: '702.111',
  mill: '701.17', proliferate: '701.34', reach: '702.17', riot: '702.136',
  station: '702.184', surveil: '701.25', trample: '702.19', transform: '701.27',
  vigilance: '702.20', ward: '702.21', 'web-slinging': '702.188',
  ...ADDITIONAL_RULE_LINKS,
});
export function mechanicRule(data, label) {
  if (typeof label !== 'string' || data?.date !== RULES_REVISION.date || data?.sourceSha256 !== RULES_REVISION.sourceSha256 || data?.sourceUrl !== RULES_REVISION.sourceUrl) return null;
  const key = label.toLowerCase(), number = MECHANIC_RULE_LINKS[key];
  const section = data.sections?.[number];
  return section?.title?.toLowerCase() === key && section.paragraphs?.length ? number : null;
}

// Source status remains available even when the local rules failed to load.
export function mechanicSourceStatus(label) {
  const key=typeof label==='string'?label.toLowerCase():'';
  return Object.hasOwn(MECHANIC_EXPLANATIONS,key)?MECHANIC_EXPLANATIONS[key].verification:null;
}

// References are independently gated by the pinned revision and exact clauses.
// A general rule does not verify a label; check the separate source status.
export function mechanicExplanation(data, label, contributingOracleIds=[]) {
  if (typeof label !== 'string' || data?.date !== RULES_REVISION.date || data?.sourceSha256 !== RULES_REVISION.sourceSha256 || data?.sourceUrl !== RULES_REVISION.sourceUrl) return null;
  const key=label.toLowerCase();
  const explanation=Object.hasOwn(MECHANIC_EXPLANATIONS,key)?MECHANIC_EXPLANATIONS[key]:null;
  // Named-card evidence must never explain an unrelated provider association.
  // Only identities that actually contribute this label may unlock the reference.
  if(explanation?.cardOracleIds&&(!Array.isArray(contributingOracleIds)||!explanation.cardOracleIds.some(id=>contributingOracleIds.includes(id))))return null;
  return explanation?.rules.every(number=>data.rules?.[number]?.text===EXPLANATORY_RULES[number])?explanation:null;
}
