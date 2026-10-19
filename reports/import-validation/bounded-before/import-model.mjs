/** Shared literal identifier semantics. Never interpolate names into search queries. */
export const normalizeCardName = value => String(value ?? '').normalize('NFC').replace(/[\u2018\u2019]/g, "'").toLocaleLowerCase('en').replace(/\s*\/\/\s*/g, ' // ').replace(/\s+/g, ' ').trim();
export const canonicalCollector = value => String(value).toLowerCase().replace(/^0+(?=\d)/, '');
export const identifierKey = identifier => identifier?.id ? `id:${identifier.id.toLowerCase()}`
  : identifier?.name ? `name:en:${normalizeCardName(identifier.name)}`
  : identifier?.set && identifier?.collector_number ? `printing:${identifier.set.toLowerCase()}:${canonicalCollector(identifier.collector_number)}` : null;
export const cardNames = card => {
  const faces=card.card_faces || [];
  // Legacy slash spellings are derived from real face metadata. Never strip or
  // replace arbitrary slashes in an imported name (e.g. Summon: Choco/Mog).
  const spellings=faces.length>1?['name','printed_name','flavor_name'].flatMap(field=>{
    const names=faces.map(face=>face[field]);
    return names.every(name=>typeof name==='string'&&name.trim())?[' // ',' / ','/',' /','/ '].map(separator=>names.join(separator)):[];
  }):[];
  return [...new Set([card.name, card.printed_name, card.flavor_name, ...faces.flatMap(face => [face.name, face.printed_name, face.flavor_name]),...spellings].filter(Boolean).map(normalizeCardName))];
};
export const matchesCardName = (card, name) => cardNames(card).includes(normalizeCardName(name));
export function printingDescription(provenance) {
  if (provenance?.kind === 'assumed') return 'Assumed printing · your list supplied a name only';
  if (provenance?.kind === 'user-selected') return 'User-selected printing';
  if (provenance?.kind === 'supplied') return 'Supplied printing · verified coordinates';
  return 'Selected reference edition';
}
