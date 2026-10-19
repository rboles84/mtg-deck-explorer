import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const RULES_DATE = '2026-09-25';
export const RULES_SOURCE_URL = 'https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt';
export const RULES_SOURCE_SHA256 = '8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE_PATH = path.join(ROOT, 'evidence', 'MagicCompRules-20260925.txt');
const OUTPUT_PATH = path.join(ROOT, 'public', 'rules-data.json');

// This is extraction, not a summary: rule wording, examples, symbols, and
// numbering come from the pinned official text. Only line endings and the
// blank separator lines around each numbered entry are normalized.
export function extractRules(bytes) {
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  if (sourceSha256 !== RULES_SOURCE_SHA256) throw new Error('Official rules source hash differs from the pinned 2026-09-25 document.');
  const source = bytes.toString('utf8').replace(/^\uFEFF/, '');
  if (!source.includes('These rules are effective as of September 25, 2026.')) throw new Error('Official rules effective date differs from the pinned date.');
  const lines = source.split(/\r?\n/);
  const firstParagraph = lines.findIndex(line => /^100\.1\. /.test(line));
  let start = firstParagraph;
  while (start >= 0 && lines[start].trim() !== '1. Game Concepts') start--;
  const end = lines.findIndex((line, index) => index > firstParagraph && line.trim() === 'Glossary');
  if (firstParagraph < 0 || start < 0 || end <= start) throw new Error('Could not locate the numbered rules body.');
  const rules = {};
  let current = null;
  const finish = () => {
    if (!current) return;
    while (current.lines.length && !current.lines.at(-1).trim()) current.lines.pop();
    const text = current.lines.map(line => line.trim() ? line : '').join('\n');
    if (!text || rules[current.number]) throw new Error('Empty or duplicate rule: ' + current.number);
    rules[current.number] = { number: current.number, text, sourceLine: current.sourceLine };
  };
  for (let index = start; index < end; index++) {
    const line = lines[index];
    const numbered = /^([1-9](?:\d{2}(?:\.\d+[a-z]*)?)?)\.?\s+([\s\S]+)$/.exec(line);
    if (numbered) {
      finish();
      current = { number: numbered[1], lines: [numbered[2]], sourceLine: index + 1 };
    } else if (current) {
      if (/^\d+\./.test(line)) throw new Error('Unrecognized numbered entry on source line ' + (index + 1));
      current.lines.push(line);
    }
  }
  finish();

  const sections = {};
  const entries = Object.values(rules);
  for (const entry of entries) {
    if (!/^(?:[1-9]|[1-9]\d{2}|[1-9]\d{2}\.\d+)$/.test(entry.number)) continue;
    const isHeading = !entry.number.includes('.') || (/^70[12]\./.test(entry.number) && entry.text.length < 160 && !/[\n.!?]/.test(entry.text));
    const parent = entry.number.split('.')[0];
    const title = isHeading ? entry.text : rules[parent]?.text ?? entry.number;
    const paragraphs = entries.filter(candidate => {
      if (candidate.number === entry.number) return !isHeading;
      if (/^[1-9]$/.test(entry.number)) return candidate.number.startsWith(entry.number) && candidate.number !== entry.number;
      if (/^[1-9]\d{2}$/.test(entry.number)) return candidate.number.startsWith(entry.number + '.');
      return candidate.number.startsWith(entry.number) && /^[a-z]+$/.test(candidate.number.slice(entry.number.length));
    }).map(({ number, text, sourceLine }) => ({ number, text, sourceLine }));
    sections[entry.number] = { title, paragraphs, sourceLine: entry.sourceLine };
  }
  for (const [number, title] of Object.entries({ '702.9': 'Flying', '702.19': 'Trample', '702.2': 'Deathtouch', '702.20': 'Vigilance', '702.10': 'Haste', '702.111': 'Menace', '702.17': 'Reach', '702.15': 'Lifelink' })) {
    if (sections[number]?.title !== title || !sections[number].paragraphs.length) throw new Error('Pinned keyword section failed verification: ' + number);
  }
  return {
    date: RULES_DATE, sourceUrl: RULES_SOURCE_URL, sourceSha256, sourceBytes: bytes.length,
    sourceLabel: 'Wizards of the Coast Comprehensive Rules', copyright: lines.find(line => line.startsWith('Published by Wizards of the Coast LLC,')),
    extraction: { formatVersion: 1, scope: 'All numbered rules and their examples; glossary and credits are not indexed.', method: 'Verbatim numbered-entry extraction; line endings and blank separator lines normalized.', numberedEntries: entries.length, sectionCount: Object.keys(sections).length },
    sections, rules
  };
}

export function serializeRules(data) { return JSON.stringify(data) + '\n'; }

async function main() {
  if (process.argv.includes('--download')) {
    const response = await fetch(RULES_SOURCE_URL, { headers: { 'User-Agent': 'DeckExplorerLocalPrototype/1.0 (official rules reference)', Accept: 'text/plain' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Official source returned HTTP ' + response.status);
    const downloaded = Buffer.from(await response.arrayBuffer());
    extractRules(downloaded);
    await mkdir(path.dirname(SOURCE_PATH), { recursive: true });
    await writeFile(SOURCE_PATH, downloaded);
  }
  const result = extractRules(await readFile(SOURCE_PATH));
  await writeFile(OUTPUT_PATH, serializeRules(result));
  console.log('Extracted ' + result.extraction.numberedEntries + ' numbered entries into ' + result.extraction.sectionCount + ' sections from ' + RULES_DATE + '.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
