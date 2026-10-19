import {identifierKey} from './import-model.mjs';
const deepFreeze = value => { if(value && typeof value === 'object' && !Object.isFrozen(value)){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTIONS = new Map([
  ['commander', 'Commander'], ['commanders', 'Commander'], ['deck', 'Deck'],
  ['mainboard', 'Deck'], ['main deck', 'Deck'], ['sideboard', 'Sideboard'],
  ['maybeboard', 'Maybeboard'], ['considering', 'Considering'],
  ['companion', 'Companion'], ['companions', 'Companion'],
]);
const CSV_HEADERS = ['Quantity', 'Name', 'Set', 'Collector Number', 'Scryfall ID', 'Language', 'Section'];
const sectionName = value => SECTIONS.get(String(value || 'Deck').trim().replace(/:$/, '').toLowerCase()) || String(value).trim();
const normalizeLanguage = value => String(value || 'en').trim().toLowerCase();
function csvRecords(text) {
  const records = [];
  let cells = [], cell = '', quoted = false, afterQuote = false, start = 0, line = 1, recordLine = 1, errors = [];
  const emit = end => {
    cells.push(cell);
    records.push({ cells, originalLine: text.slice(start, end), lineNumber: recordLine, errors });
    cells = []; cell = ''; afterQuote = false; errors = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { quoted = false; afterQuote = true; }
      else { cell += ch; if (ch === '\n') line++; }
    } else if (ch === '"' && !cell.trim() && !afterQuote) { cell = ''; quoted = true; }
    else if (ch === ',') { cells.push(cell); cell = ''; afterQuote = false; }
    else if (ch === '\r' || ch === '\n') {
      emit(i);
      if (ch === '\r' && text[i + 1] === '\n') i++;
      line++; start = i + 1; recordLine = line;
    } else {
      if (afterQuote && !/\s/.test(ch)) errors.push('Unexpected text after a quoted CSV field.');
      if (ch === '"') errors.push('Unexpected quote in an unquoted CSV field.');
      cell += ch;
    }
  }
  if (quoted) errors.push('Unterminated quoted CSV field.');
  if (start < text.length || cells.length || cell) emit(text.length);
  return records;
}

function finishRow(data, index) {
  const quantityText=String(data.quantity ?? '').trim();
  const row = {
    id: `row-${index + 1}`, lineNumber: data.lineNumber, originalLine: data.originalLine,
    section: sectionName(data.section), quantityText, quantity: /^\d+$/.test(quantityText)?Number(quantityText):NaN, name: String(data.name || '').trim(),
    set: String(data.set || '').trim().toLowerCase(), collectorNumber: String(data.collectorNumber || '').trim(),
    scryfallId: String(data.scryfallId || '').trim().toLowerCase(),
    language: String(data.language || '').trim() ? normalizeLanguage(data.language) : (String(data.scryfallId || '').trim() ? null : 'en'),
    tags: data.tags || [], annotations: data.annotations || [], csvMetadata: data.csvMetadata || null, finish: data.finish || 'unspecified',
    sourceSection: sectionName(data.section), explicitPlacement: data.explicitPlacement || null, block: data.block ?? 0, blockHasHeading: Boolean(data.blockHasHeading), commanderSource: data.commanderSource || null,
    printingProvenance: null, playable: false, identifier: null, lookup: null, status: 'pending', issues: [...(data.issues || [])], card: null,
  };
  row.playable = row.section === 'Commander' || row.section === 'Deck';
  if (![...SECTIONS.values()].includes(row.section)) row.issues.push('Unrecognized section; use Deck, Commander, Sideboard, Maybeboard, Considering, or Companion.');
  if (!Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 999) row.issues.push('Quantity must be a positive integer from 1 to 999.');
  if (!row.name) row.issues.push('A card name is required.');
  if (!['unspecified','foil','nonfoil','etched'].includes(row.finish)) row.issues.push('Unsupported finish; use foil, nonfoil, or etched.');
  if (row.name.length > 500 || /[\u0000-\u001f\u007f]/.test(row.name.replace(/[\r\n\t]/g, ''))) row.issues.push('Invalid or oversized card name.');
  if (row.scryfallId && !UUID.test(row.scryfallId)) row.issues.push('Scryfall ID must be a printing UUID.');
  if (row.set && !/^[a-z0-9]{2,8}$/.test(row.set)) row.issues.push('Invalid set code.');
  if (row.collectorNumber && !/^[\p{L}\p{N}._★☆†-]{1,32}$/u.test(row.collectorNumber)) row.issues.push('Unsupported collector number; the original value is preserved.');
  if (row.language !== null && !/^[a-z]{2,5}$/.test(row.language)) row.issues.push('Invalid language code.');
  if (row.issues.length) row.status = 'invalid';
  else if (row.language !== 'en' && !row.scryfallId) {
    row.status = 'language-unsupported';
    row.issues.push('A non-English printing requires its exact Scryfall printing UUID.');
  } else if (row.scryfallId) { row.identifier = { id: row.scryfallId }; row.lookup = {kind: 'printing-id', id: row.scryfallId}; }
  else if (row.set && row.collectorNumber) { row.identifier = { set: row.set, collector_number: row.collectorNumber }; row.lookup = {kind: 'printing-coordinates', set: row.set, collectorNumber: row.collectorNumber}; }
  else if (!row.set && !row.collectorNumber) { row.identifier = {name: row.name.replace(/\s+/g, ' ')}; row.lookup = {kind: 'card-name', name: row.name}; }
  else {
    row.status = 'printing-unknown';
    row.issues.push('Incomplete printing coordinates: supply both set and collector number, or remove both to request an assumed printing.');
  }
  row.parseIssues = [...row.issues];
  return row;
}

function textMetadata(line) {
  const tags = [], annotations = [], finishes = [], issues = [];
  // Consume only recognized suffix structures, in either supported order.
  while (true) {
    let match = line.match(/\s+\[([^\[\]]+)\]\s*$/);
    if (match) { tags.unshift(match[1]); line = line.slice(0, match.index).trim(); continue; }
    match = line.match(/\s+\^([^\^\r\n]+)\^\s*$/);
    if (match) { annotations.unshift(match[1]); line = line.slice(0, match.index).trim(); continue; }
    match = line.match(/\s+\*(F|E)\*\s*$/i);
    if (match) { finishes.unshift(match[1].toUpperCase() === 'F' ? 'foil' : 'etched'); line = line.slice(0, match.index).trim(); continue; }
    break;
  }
  if (finishes.length > 1) issues.push('Multiple finish markers; supply a single *F* or *E* marker.');
  if (/\s[\[\^]|\s\*[^\s]*\*/.test(line)) issues.push('Unrecognized or malformed trailing metadata.');
  const placements = tags.flatMap(tag => tag.split(',').map(part => part.trim()).filter(part => /^(Commander|Maybeboard|Sideboard|Considering|Companion)(?:\{[^}]*\})*$/i.test(part)).map(part => sectionName(part.replace(/\{[^}]*\}/g, ''))));
  if (new Set(placements).size > 1) issues.push('Conflicting section tags; choose one placement for this entry.');
  const noDeck=tags.some(tag=>/\{noDeck\}/i.test(tag));
  if(noDeck&&placements.includes('Commander'))issues.push('Commander metadata conflicts with {noDeck}; correct the entry placement.');
  return {line, tags, annotations, finish: finishes[0] || 'unspecified', issues, placement: placements[0] || (noDeck?'Considering':null)};
}

export function parseDeckInput(text, {commanderRowIds = []} = {}) {
  if (typeof text !== 'string') throw new TypeError('Deck input must be text.');
  if (text.length > 200000) throw new RangeError('Deck input is limited to 200,000 characters.');
  const sourceText = text;
  const working = text.replace(/^\uFEFF/, '');
  const firstLine = (working.split(/\r\n|\n|\r/).find(line => line.trim()) || '').trim();
  const format = !/^\d+\s*x?\s+/i.test(firstLine) && firstLine.includes(',') && /(?:^|,)\s*"?(?:Quantity|Name|Collector Number|Scryfall ID)"?\s*(?:,|$)/i.test(firstLine) ? 'csv' : 'text';
  const rows = [], issues = [];
  if (format === 'csv') {
    const records = csvRecords(working).filter(record => record.originalLine.trim());
    const header = records.shift();
    issues.push(...header.errors.map(message=>`CSV header: ${message}`));
    const labels = header.cells.map(cell => cell.trim().toLowerCase());
    const headerValid = ['quantity', 'name'].every(label => labels.includes(label)) && new Set(labels).size === labels.length;
    if (!headerValid) issues.push('CSV requires distinct Quantity and Name columns; printing and section columns are optional.');
    for (const record of records) {
      const field = name => record.cells[labels.indexOf(name.toLowerCase())] || '';
      const rowIssues = [...header.errors.map(message=>`CSV header: ${message}`),...record.errors];
      if (!headerValid) rowIssues.push('CSV header is missing required or has duplicate columns.');
      if (record.cells.length !== labels.length) rowIssues.push('CSV row has a different number of fields than its header.');
      const foil = field('Foil').trim().toLowerCase();
      const finish = field('Finish').trim().toLowerCase() || (foil === 'true' || foil === 'yes' || foil === '1' ? 'foil' : foil === 'false' || foil === 'no' || foil === '0' ? 'nonfoil' : 'unspecified');
      if (foil && !['true','yes','1','false','no','0'].includes(foil)) rowIssues.push('Unsupported Foil value; use true or false.');
      if (field('Finish') && foil && ((finish === 'foil') !== ['true','yes','1'].includes(foil))) rowIssues.push('Conflicting Finish and Foil columns.');
      const csvMetadata = Object.fromEntries(labels.filter(label => !CSV_HEADERS.map(header=>header.toLowerCase()).includes(label) && !['finish','foil'].includes(label)).map(label=>[label,field(label)]));
      rows.push(finishRow({ ...record, quantity: field('Quantity'), name: field('Name'), set: field('Set'), collectorNumber: field('Collector Number'), scryfallId: field('Scryfall ID'), language: field('Language'), section: field('Section') || 'Deck', commanderSource: sectionName(field('Section')) === 'Commander' ? 'column' : null, finish, csvMetadata, issues: rowIssues }, rows.length));
    }
  } else {
    let section = 'Deck', block = 0, blank = false, blockHasHeading = false;
    working.split(/\r\n|\n|\r/).forEach((originalLine, lineIndex) => {
      let line = originalLine.trim();
      if (!line) { blank = true; return; }
      if (blank) { block++; blank = false; blockHasHeading = false; }
      const heading = SECTIONS.get(line.replace(/:$/, '').toLowerCase());
      if (heading) { section = heading; blockHasHeading = true; return; }
      const metadata = textMetadata(line);
      const {tags, annotations, finish} = metadata; line = metadata.line;
      const quantityMatch = line.match(/^(\d+)\s*x?\s+(.+)$/i);
      const taggedCommander = tags.some(tag => /^commander(?:\{[^}]*\})?$/i.test(tag));
      const data = { lineNumber: lineIndex + 1, originalLine, block, blockHasHeading, explicitPlacement:metadata.placement || null, section: metadata.placement || (taggedCommander ? 'Commander' : section), commanderSource: metadata.placement === 'Commander' ? 'tag' : section === 'Commander' ? 'heading' : null, tags, annotations, finish, quantity: quantityMatch?.[1], name: quantityMatch?.[2] || line, issues: [...metadata.issues] };
      if (!quantityMatch) data.issues.push('Unrecognized line: expected a positive quantity followed by a card name.');
      const printing = data.name.match(/^(.*?)\s+\(([A-Za-z0-9]+)\)\s+(\S+)\s*$/);
      if (printing) { data.name = printing[1]; data.set = printing[2]; data.collectorNumber = printing[3]; }
      else if (/\s+\([A-Za-z0-9]+\)\s+/.test(data.name)) data.issues.push('Malformed printing coordinates or unexpected trailing text; expected Card Name (SET) CollectorNumber.');
      else if (/\s+\([A-Za-z0-9]{2,8}\)$/.test(data.name)) data.issues.push('Incomplete printing coordinates; a set code requires a collector number.');
      rows.push(finishRow(data, rows.length));
    });
  }
  if (rows.length > 500) throw new RangeError('Deck input is limited to 500 entries.');
  // A separated final singleton after a sideboard is a suggestion, never an inference.
  const last = rows.at(-1), previous = rows.at(-2);
  const suggestions = last && previous && !rows.some(row => row.section === 'Commander') && last.section === 'Sideboard' && !last.blockHasHeading && !last.explicitPlacement && last.quantity === 1 && last.block > previous.block
    ? [{rowId: last.id, name: last.name, lineNumber: last.lineNumber}] : [];
  for (const rowId of commanderRowIds) {
    const row = rows.find(candidate => candidate.id === rowId);
    if (!row || !suggestions.some(candidate => candidate.rowId === rowId)) throw new Error('Commander placement must refer to the suggested entry in this draft.');
    row.section = 'Commander'; row.playable = true; row.commanderSource = 'confirmed';
  }
  const unique = new Map(rows.filter(row => row.identifier).map(row => [identifierKey(row.identifier), row.identifier]));
  return deepFreeze({ sourceText, format, parserVersion: 'text-import-v2', rows, identifiers: [...unique.values()], issues, commanderSuggestions: suggestions.filter(candidate => !commanderRowIds.includes(candidate.rowId)) });
}

