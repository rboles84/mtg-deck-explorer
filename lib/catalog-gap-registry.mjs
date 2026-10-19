import {validateRegistry,queryHash} from './mechanic-discovery.mjs';
import {CATALOG_GAPS,CATALOG_GAP_REVIEW} from '../public/catalog-gap-data.mjs';

export function validateCatalogGapRegistry(registry,atlas){
  if(!Array.isArray(registry.rows)||registry.rows.length!==CATALOG_GAPS.length)throw new Error('Catalog gap recipe scope mismatch.');
  const ids=new Set(atlas.rows.map(r=>r.id));
  for(const gap of CATALOG_GAPS){
    const mapping=registry.records?.find(r=>r.key===gap.key),row=registry.rows.find(r=>r.id===mapping?.atlasRowId);
    const expression=gap.pattern?`fo:/${gap.pattern}/`:`kw:${JSON.stringify(gap.term)}`;
    if(!row||ids.has(row.id)||row.label!==gap.term||row.query!==expression||row.tier!=='Review'||row.auto_execute!==false||row.parameters.length||mapping.querySha256!==queryHash(expression))throw new Error('Catalog gap recipe is not the proven expression.');
    ids.add(row.id);
  }
  const combined={...atlas,rows:[...atlas.rows,...registry.rows]};
  validateRegistry(registry,combined,{version:CATALOG_GAP_REVIEW.version,auditSha256:CATALOG_GAP_REVIEW.evidenceSha256,labels:CATALOG_GAPS});
  return registry;
}
