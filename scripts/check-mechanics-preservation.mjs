import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const output = 'reports/mechanics-integration';
const roots = ['inputs', 'fixtures', 'references', 'reports/mechanics-coverage',
  'C:/dev/mtg-mechanics', 'C:/dev/mtg-source-snapshots'];
function files(root) {
  return fs.readdirSync(root, {withFileTypes:true}).flatMap(e => {
    const p = path.join(root,e.name);
    return e.isDirectory() ? files(p) : e.isFile() ? [p] : [];
  });
}
const digest = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const current = Object.fromEntries(roots.flatMap(files).sort().map(p => [p.replaceAll('\\','/'),digest(p)]));
const manifest = `${output}/protected-before.json`;
fs.mkdirSync(output,{recursive:true});
let protectedCount=Object.keys(current).length;
if(process.argv.includes('--capture')) {
  if(fs.existsSync(manifest))throw new Error('Baseline already exists; refusing to replace it.');
  fs.writeFileSync(manifest,JSON.stringify(current,null,2)+'\n');
  for(const p of ['public/app.mjs','public/index.html','lib/scryfall.mjs','README.md']) {
    const dest=`${output}/before/${p}`;fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(p,dest);
  }
} else {
  const before=JSON.parse(fs.readFileSync(manifest));
  protectedCount=Object.keys(before).length;
  // Explicitly authorized new derived inputs; all historical files remain pinned.
  const additions=new Set(['inputs/atlas_v2.1.json','inputs/mechanic-discovery.v1.json','inputs/mechanic-discovery.shortlist.json','inputs/mechanic-discovery.variants.json']);
  const changed=[...new Set([...Object.keys(before),...Object.keys(current)])].filter(p=>before[p]!==current[p]&&!(additions.has(p)&&!Object.hasOwn(before,p)));
  if(changed.length)throw new Error(`Protected files changed: ${changed.join(', ')}`);
}
console.log(`${protectedCount} historical protected files ${process.argv.includes('--capture')?'fingerprinted':'unchanged'} (including research Git files); ${Object.keys(current).length-protectedCount} authorized derived inputs added.`);
