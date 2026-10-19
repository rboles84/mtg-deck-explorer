import {createHash} from 'node:crypto';

export const queryHash = query => createHash('sha256').update(query).digest('hex');
// Only the exact approved leading baseline may be factored out. Never remove
// filters from inside an OR branch, or accept caller-supplied replacement text.
export function recipeExpression(row) {
  const prefix='f:commander id<=[COLORS] ';
  let expression=row.query;
  if(JSON.stringify(row.parameters)==='["[COLORS]"]'&&expression.startsWith(prefix))expression=expression.slice(prefix.length);
  else if(row.parameters.length)throw new Error('Unbound recipe parameters.');
  if(!expression||/\[(?:[A-Z_ ]+)\]/.test(expression)||/(?:^|[\s(])-?(?:f|format|id|identity|c|color)[:<=>]/i.test(expression))throw new Error('Unexpected recipe baseline or placeholder.');
  return expression;
}

export function approvedExpression(record) {
  const row=record?.atlas,mapping=record?.discovery;
  if(!row||!mapping||mapping.execution!=='manual'||mapping.display!==true||mapping.atlasRowId!==row.id||
    record.atlas_row_id!==row.id||!['Production-ready','Review'].includes(row.tier)||
    row.auto_execute!==(row.tier==='Production-ready')||mapping.validation?.status!=='passed'||
    mapping.querySha256!==queryHash(row.query)||mapping.validation.query!==row.query||
    !mapping.coverage||row.fallback!==null||row.fallback_count!==null)throw new Error('Recipe is not in the validated discovery whitelist.');
  const expression=recipeExpression(row);
  if(expression!==mapping.expression)throw new Error('Discovery expression drifted from the validated recipe.');
  return expression;
}

export function validateRegistry(registry,atlas,vocabulary) {
  if(registry.version!=='1.0.0'||registry.atlasVersion!==atlas.version||registry.vocabularyVersion!==vocabulary.version||registry.auditSha256!==vocabulary.auditSha256||registry.records?.length!==vocabulary.labels.length)throw new Error('Discovery registry version or scope mismatch.');
  const labels=new Map(vocabulary.labels.map(l=>[l.key,l.term])),ids=new Set(),keys=new Set();
  for(const mapping of registry.records){
    if(!labels.has(mapping.key)||labels.get(mapping.key)!==mapping.label||keys.has(mapping.key)||ids.has(mapping.atlasRowId))throw new Error('Discovery mapping is missing, duplicated, or not an exact audited label.');
    keys.add(mapping.key);ids.add(mapping.atlasRowId);
    const row=atlas.rows.find(r=>r.id===mapping.atlasRowId);
    approvedExpression({atlas:row,atlas_row_id:mapping.atlasRowId,discovery:mapping});
    if(!mapping.validation.positive?.length||!mapping.validation.negative?.length||!/^\d{4}-\d{2}-\d{2}T/.test(mapping.validation.checkedAt))throw new Error('Discovery mapping lacks membership evidence.');
  }
  return registry;
}
