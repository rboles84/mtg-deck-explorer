// Explicit column vocabulary shared by the small export adapters. Unknown
// meaning-bearing columns are errors; harmless columns remain source metadata.
const key = value => value.trim().toLowerCase().replace(/[ _-]/g, '');
const fields = {
  quantity: ['quantity', 'qty'], name: ['name'], set: ['set', 'setcode', 'printing'],
  collectorNumber: ['collectornumber'], scryfallId: ['scryfallid'], oracleId: ['oracleid'],
  language: ['language'], section: ['section', 'board'], commander: ['commander'],
  finish: ['finish'], foil: ['foil'], extras: ['extras'],
};
const meaningful = /commander|companion|board|section|printing|edition|scryfall|collector|oracle|language|finish|foil|^set$|^setcode$|^role$/;

export function csvAdapter(header) {
  const labels = header.map(key), issues = [], indices = new Map();
  for (const [field, aliases] of Object.entries(fields)) {
    const found = labels.flatMap((label, index) => aliases.includes(label) ? [index] : []);
    if (found.length > 1) issues.push(`CSV has duplicate ${field} columns; keep one source of meaning.`);
    if (found.length) indices.set(field, found[0]);
  }
  if (!indices.has('quantity') || !indices.has('name') || new Set(labels).size !== labels.length) issues.push('CSV requires distinct Quantity (or Qty) and Name columns, without duplicate columns.');
  for (const label of labels) if (!Object.values(fields).flat().includes(label) && label !== 'setname' && meaningful.test(label)) issues.push(`Unsupported meaning-bearing CSV column: ${label}. Use a supported role or printing column.`);
  const schema = labels.includes('board') && labels.includes('printing') && labels.includes('commander') ? 'TappedOut CSV'
    : ['scryfallid','setcode','collectornumber','extras','oracleid'].every(label => labels.includes(label)) ? 'Helvault-compatible CSV' : 'CSV';
  // TappedOut's CMA/CM1 codes collide with Scryfall's set meanings, even on
  // successful lookups. Block this export format before creating identifiers.
  if (schema === 'TappedOut CSV') throw new Error("TappedOut CSV isn't supported, please use its TXT export or an export from another deck builder.");
  return {schema, issues, row(cells) {
    const value = field => cells[indices.get(field)]?.trim() || '';
    const rowIssues = [], warnings = [];
    let section = value('section') || 'Deck', commanderSource = null;
    const flag = value('commander').toLowerCase();
    if (flag && !['true','false'].includes(flag)) rowIssues.push('Commander must be True, False, or blank.');
    if (flag === 'true') {
      if (!/^(deck|main|mainboard|main deck|commander|commanders)$/i.test(section)) rowIssues.push('Commander=True conflicts with an extra board. Correct the source placement.');
      else { section = 'Commander'; commanderSource = 'column'; }
    }
    if (/^commanders?$/i.test(section)) commanderSource = 'column';
    const foil = value('foil').toLowerCase(), explicitFinish = value('finish').toLowerCase();
    const finishes = {'true':'foil',yes:'foil','1':'foil',foil:'foil','false':'nonfoil',no:'nonfoil','0':'nonfoil',nonfoil:'nonfoil',etched:'etched'};
    if (foil === 'pre') warnings.push('Source Foil=pre is preserved; the exact finish is unspecified.');
    else if (foil && !finishes[foil]) rowIssues.push('Unsupported Foil value; finish cannot be inferred.');
    if (explicitFinish && finishes[foil] && explicitFinish !== finishes[foil]) rowIssues.push('Conflicting Finish and Foil columns.');
    // Helvault extras are retained, never treated as deck placement. Nonempty
    // values need review until their copy-level meaning is supported.
    if (value('extras') && value('extras') !== '[]') rowIssues.push('Unsupported Extras metadata; clarify its finish or variant meaning before importing.');
    if (labels.includes('setname') && cells[labels.indexOf('setname')]?.trim() && !value('set') && !value('scryfallId')) warnings.push('Set Name is preserved as metadata; supply a set code to constrain the assumed printing.');
    return {
      quantity: value('quantity'), name: value('name'), set: value('set'), collectorNumber: value('collectorNumber'),
      scryfallId: value('scryfallId'), oracleId: value('oracleId'), language: value('language'), section,
      sourceSection: value('section') || 'Deck', commanderSource, finish: explicitFinish || finishes[foil] || 'unspecified',
      // Retain all columns, including the exact source codes and role spelling.
      csvMetadata: Object.fromEntries(header.map((label, index) => [label.trim().toLowerCase(), cells[index] || ''])),
      issues: rowIssues, warnings,
    };
  }};
}
