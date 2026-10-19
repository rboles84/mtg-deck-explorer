import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dir='reports/remaining-six-sources-20261019';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const before=JSON.parse(fs.readFileSync(`${dir}/before.json`));
const changed=[],missing=[];
for(const [file,sha] of Object.entries(before.files)){
 if(!fs.existsSync(file))missing.push(file);
 else if(hash(fs.readFileSync(file))!==sha)changed.push(file);
}
const outsideAdditions=[];
function walk(base){for(const e of fs.readdirSync(base,{withFileTypes:true})){const p=path.posix.join(base,e.name);if(p===dir)continue;if(e.isDirectory())walk(p);else if(e.isFile()&&!Object.hasOwn(before.files,p))outsideAdditions.push(p);}}
walk('.');
const receipts=JSON.parse(fs.readFileSync(`${dir}/receipts.json`));
for(const r of receipts.filter(r=>r.file))if(hash(fs.readFileSync(`${dir}/${r.file}`))!==r.sha256)throw Error('Source receipt hash mismatch: '+r.url);
const findings=JSON.parse(fs.readFileSync(`${dir}/findings.json`));
if(findings.rows.length!==6||findings.rows.some(r=>r.officialGeneralDefinitionVerified))throw Error('Unexpected verification scope');
for(const row of findings.rows)for(const a of row.artifacts??[])if(hash(fs.readFileSync(`${dir}/${a.file}`))!==a.sha256)throw Error('Artifact changed: '+a.file);
const tests=fs.readFileSync(`${dir}/tests.txt`,'utf8');
if(!/pass 343/.test(tests)||!/fail 0/.test(tests))throw Error('Full test suite not confirmed');
const result={checkedAt:new Date().toISOString(),existingFiles:Object.keys(before.files).length,unchanged:Object.keys(before.files).length-changed.length-missing.length,changed,missing,outsideAdditions,sourceReceiptsChecked:receipts.filter(r=>r.file).length,tests:{passed:343,failed:0,logSha256:hash(Buffer.from(tests))},applicationChanges:changed.length+missing.length+outsideAdditions.length};
fs.writeFileSync(`${dir}/preservation.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
if(result.applicationChanges)process.exitCode=1;
