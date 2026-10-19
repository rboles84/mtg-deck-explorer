import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extractRules, serializeRules, RULES_DATE, RULES_SOURCE_URL, RULES_SOURCE_SHA256 } from '../scripts/extract-rules.mjs';

const source = await readFile(new URL('../evidence/MagicCompRules-20260925.txt', import.meta.url));
const publishedBytes = await readFile(new URL('../public/rules-data.json', import.meta.url), 'utf8');
const data = JSON.parse(publishedBytes);

test('rules data is reproducibly derived from the pinned official source without source edits', () => {
  assert.equal(createHash('sha256').update(source).digest('hex'), RULES_SOURCE_SHA256);
  assert.equal(data.date, RULES_DATE);
  assert.equal(data.sourceUrl, RULES_SOURCE_URL);
  assert.equal(data.sourceSha256, RULES_SOURCE_SHA256);
  assert.equal(data.sourceBytes, 977752);
  assert.equal(serializeRules(extractRules(source)), publishedBytes);
  const changed = Buffer.from(source);
  changed[0] ^= 1;
  assert.throws(() => extractRules(changed), /source hash differs/);
});

test('all numbered entries have exact source locations and the glossary is not misclassified as rules', () => {
  assert.equal(Object.keys(data.rules).length, 3322);
  assert.equal(Object.keys(data.sections).length, 1331);
  const lines = source.toString('utf8').split(/\r?\n/);
  for (const [number, rule] of Object.entries(data.rules)) {
    assert.equal(rule.number, number);
    const sourceLine = lines[rule.sourceLine - 1];
    const prefix = new RegExp('^' + number.replace('.', '\\.') + '\\.?\\s+');
    assert.match(sourceLine, prefix, number);
    assert.ok(rule.text.startsWith(sourceLine.replace(prefix, '')), number);
    assert.ok(rule.text.trim(), number);
  }
  assert.ok(data.rules['100.1']);
  assert.ok(data.rules['905.6']);
  assert.equal(data.rules.Glossary, undefined);
  assert.ok(!data.rules['905.6'].text.includes('Credits'));
});

test('reviewed mechanic sections contain full official subrules and retained examples', () => {
  const expected = { '702.9': ['Flying', 3], '702.19': ['Trample', 7], '702.2': ['Deathtouch', 6], '702.20': ['Vigilance', 3], '702.10': ['Haste', 4], '702.111': ['Menace', 3], '702.17': ['Reach', 3], '702.15': ['Lifelink', 6] };
  for (const [number, [title, count]] of Object.entries(expected)) {
    assert.equal(data.sections[number].title, title);
    assert.equal(data.sections[number].paragraphs.length, count, number);
    assert.ok(data.sections[number].paragraphs.every(paragraph => paragraph.number.startsWith(number) && paragraph.text === data.rules[paragraph.number].text));
  }
  assert.equal(data.rules['702.9a'].text, 'Flying is an evasion ability.');
  assert.match(data.rules['702.9b'].text, /flying and\/or reach/);
  assert.match(data.rules['702.19b'].text, /Example:/);
  assert.match(data.rules['702.19c'].text, /Example:/);
  assert.match(data.rules['205.4c'].text, /Cards printed in sets prior to the Eighth Edition/);
  assert.ok(data.rules['205.4c'].text.includes('\u2028'));
  assert.match(data.rules['903.4'].text, /color identity/);
});
