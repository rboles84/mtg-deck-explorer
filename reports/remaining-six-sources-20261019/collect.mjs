import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const indexPath=path.join(dir,'receipts.json');
const receipts=fs.existsSync(indexPath)?JSON.parse(fs.readFileSync(indexPath)):[];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.mkdirSync(path.join(dir,'sources'),{recursive:true});
for(const url of process.argv.slice(2)){
  const receipt={url,retrievedAt:new Date().toISOString()};
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(25000)});
    const bytes=Buffer.from(await r.arrayBuffer());
    const contentType=r.headers.get('content-type');
    const ext=contentType?.includes('pdf')?'pdf':contentType?.includes('json')?'json':'html';
    const sha256=hash(bytes),file=`sources/${sha256}.${ext}`;
    fs.writeFileSync(path.join(dir,file),bytes);
    Object.assign(receipt,{status:r.status,finalUrl:r.url,contentType,sha256,file,bytes:bytes.length});
    if(ext==='html'){
      const html=bytes.toString();
      const plain=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
      receipt.textFile=`sources/${sha256}.txt`;
      fs.writeFileSync(path.join(dir,receipt.textFile),plain);
      receipt.matches=[...plain.matchAll(/.{0,80}(affinitycycling|hero.?s reward|kinfall|landship|actualize|covercast|Plane-Merge Elf).{0,200}/gi)].map(x=>x[0]);
      receipt.pdfLinks=[...new Set([...html.matchAll(/(?:href|src)=["']([^"']+\.pdf[^"']*)["']/gi)].map(x=>x[1]))];
    }
  }catch(error){receipt.error=error.message;receipt.cause=error.cause?.code;}
  receipts.push(receipt);
  fs.writeFileSync(indexPath,JSON.stringify(receipts,null,2)+'\n');
  console.log(JSON.stringify(receipt));
}
