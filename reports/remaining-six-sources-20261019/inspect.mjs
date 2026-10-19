import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const receipts=JSON.parse(fs.readFileSync(path.join(dir,'receipts.json')));
for(const r of receipts.filter(r=>r.status===200 && process.argv.slice(2).some(s=>r.url.includes(s)))){
 const html=fs.readFileSync(path.join(dir,r.file),'utf8');
 const links=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(x=>({url:x[1].replace(/&amp;/g,'&'),text:x[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}));
 console.log(JSON.stringify({url:r.url,body:fs.readFileSync(path.join(dir,r.textFile),'utf8').slice(0,1500),links:links.filter(l=>/wizards|\.pdf|card-image-gallery|release-notes|youtube|youtu\.be|twitter|unknown-event|youtu|archive.org/i.test(l.url))},null,2));
}
