import fs from 'node:fs';
import crypto from 'node:crypto';
const dir='reports/remaining-six-sources-20261019';
const receipts=JSON.parse(fs.readFileSync(`${dir}/receipts.json`));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const source=url=>{
 const r=receipts.findLast(r=>r.url===url&&r.status===200&&r.bytes>0);
 if(!r)throw Error(`Missing retained source: ${url}`);
 if(hash(fs.readFileSync(`${dir}/${r.file}`))!==r.sha256)throw Error(`Changed source: ${url}`);
 return {url,finalUrl:r.finalUrl,retrievedAt:r.retrievedAt,sha256:r.sha256,file:r.file};
};
const artifact=file=>({file,sha256:hash(fs.readFileSync(`${dir}/${file}`))});
const wiki=name=>source(`https://mtg.wiki/page/${name}`);
const artists=source('https://magic.wizards.com/en/news/feature/mystery-booster-playtest-card-artists-2019-11-11');
const release=source('https://magic.wizards.com/en/news/feature/mystery-booster-release-notes-2019-11-11');
const archivedHero=source('https://web.archive.org/web/20201021225115/https://magic.wizards.com/en/articles/archive/latest-developments/building-hydra-2013-10-25');
const heroText=fs.readFileSync(`${dir}/${receipts.find(r=>r.sha256===archivedHero.sha256).textFile}`,'utf8');
const heroQuote="This is where the hero's reward mechanic emerged.";
if(!heroText.includes(heroQuote))throw Error('Missing exact official Hero reference');
const rows=[
 {name:'Affinitycycling',status:'verified-designer-card-example',officialGeneralDefinitionVerified:false,
  wiki:[wiki('Unknown_Event/2023_list_of_event_cards')],
  evidence:[source('https://www.youtube.com/watch?v=NuWq8-rnJ38')],
  locator:{url:'https://www.youtube.com/watch?v=NuWq8-rnJ38&t=617s',author:'Gavin Verhey',channel:'Good Morning Magic',publishedOn:'2023-02-20',timestampSeconds:617,card:"Sojourner's Enforcermite"},
  artifacts:[artifact('affinitycycling-designer-video.png')],
  verifiedScope:'The designer video visibly presents the card name, Affinitycycling 2 and its printed reminder text. The reminder wording agrees with the retained Scryfall example; the video uses plain numeric costs.',
  limits:'First-hand designer publication, not a Wizards Comprehensive Rules definition or a Wizards-hosted release note. The video type line omits Artifact, unlike the retained Scryfall record. No whole-card metadata replacement is supported. Automatic captions were used only to locate the slide; they are not accepted mechanic text.'},
 {name:"Hero's Reward",status:'verified-archived-wizards-mechanic-discussion',officialGeneralDefinitionVerified:false,
  wiki:[wiki('Hero%27s_Reward'),wiki('Face_the_Hydra')],evidence:[archivedHero],
  locator:{title:'Building a Hydra',author:'Sam Stoddard',publishedOn:'2013-10-25',section:"A Hero's Reward",originalUrl:'https://magic.wizards.com/en/articles/archive/latest-developments/building-hydra-2013-10-25'},
  exactExcerpt:heroQuote,
  verifiedScope:'Official Wizards design discussion explicitly identifies the mechanic and its origin in Face the Hydra.',
  limits:'Retrieved from the Internet Archive copy cited by the wiki. The current original URL returns 404. This design article is not a formal rule covering every Challenge Deck card; do not apply its Hydra-specific account as a universal trigger definition.'},
 {name:'Kinfall',status:'official-card-existence-only-definition-unverified',officialGeneralDefinitionVerified:false,
  wiki:[wiki('Kinfall')],evidence:[artists,release],
  locator:{card:'Plane-Merge Elf',artist:'Nataly Scheidt'},
  verifiedScope:'Wizards lists Plane-Merge Elf and its artist.',
  limits:'The official artist list contains no card ability text. The verified 2019 release notes contain neither this card name nor Kinfall. The wiki section has no citation attached to its Kinfall definition. An official definition or original official card image was not verified.'},
 {name:'Landship',status:'official-card-existence-only-definition-unverified',officialGeneralDefinitionVerified:false,
  wiki:[wiki('Landship')],evidence:[artists,release],
  locator:{card:'Plane-Merge Elf',artist:'Nataly Scheidt'},
  verifiedScope:'Wizards lists Plane-Merge Elf and its artist.',
  limits:'The official artist list contains no card ability text. The verified 2019 release notes contain neither this card name nor Landship. The wiki section has no citation attached to its Landship definition. An official definition or original official card image was not verified.'},
 {name:'Actualize',status:'verified-wizards-card-example',officialGeneralDefinitionVerified:false,
  wiki:[wiki('Actualize')],evidence:[source('https://magic.wizards.com/en/news/mtg-arena/alchemy-reality-fracture-spellbook'),source('https://magic.wizards.com/en/products/reality-fracture/card-image-gallery?cigset=Y26-FRA')],
  locator:{card:'Etali, Primal Garden',galleryEntry:'1nAcR8CqQNfGwjuXIOhrZ9',galleryUrl:'https://magic.wizards.com/en/products/reality-fracture/card-image-gallery?cigset=Y26-FRA&cigquery=Etali',imageUrl:'https://media.wizards.com/2026/fra/23ns838efds/en_Lxfa4Q7Z9u.webp'},
  artifacts:[artifact('actualize-official-dom.html'),artifact('actualize-official.png')],
  verifiedScope:'The official gallery and its Wizards-hosted image show Actualize on Etali; its first ability agrees with the retained Scryfall cost-reduction wording.',
  limits:'No formal mechanic-wide definition was verified. The wiki generalizes Actualize as a cast trigger; Etali is a counterexample to that universal formulation. Its wiki reference concerns Arena rules policy in 2021, not this 2026 mechanic.'},
 {name:'Covercast',status:'verified-wizards-card-example',officialGeneralDefinitionVerified:false,
  wiki:[wiki('Covercast')],evidence:[source('https://magic.wizards.com/en/news/mtg-arena/announcements-may-11-2026'),source('https://magic.wizards.com/en/products/secrets-of-strixhaven/card-image-gallery')],
  locator:{card:'Summitfest Closing Ceremony',galleryEntry:'1rnXSILJY2jVH90bVQ0yxt',galleryUrl:'https://magic.wizards.com/en/products/secrets-of-strixhaven/card-image-gallery?cigquery=Summitfest%20Closing%20Ceremony',imageUrl:'https://media.wizards.com/2026/sos/Lag23xc2fN/en_dmeAiPcKlR.webp'},
  artifacts:[artifact('covercast-official-dom.html'),artifact('covercast-official.png')],
  verifiedScope:'The official announcement identifies the card, and its official gallery image shows the Covercast ability. That line agrees with the retained Scryfall example.',
  limits:'The official image does not state that the ability functions in all zones or does not use the stack. Those wiki claims remain unverified. The wiki calls this a keyword ability while the retained Scryfall catalog classifies it as an ability word; no classification change is justified by this evidence.'}
];
for(const row of rows.filter(r=>r.locator?.imageUrl)){
 const dom=fs.readFileSync(`${dir}/${row.artifacts.find(a=>a.file.endsWith('.html')).file}`,'utf8');
 if(!dom.includes(row.locator.imageUrl)||!dom.includes(row.locator.card))throw Error('Gallery provenance mismatch: '+row.name);
}
const result={version:1,reviewedOn:'2026-10-19',scope:'Source investigation only. No application files, source statuses, definitions, detection, search recipes or prior validation records changed.',
 summary:{namesInvestigated:6,verifiedWizardsDiscussion:1,verifiedWizardsCardExamples:2,verifiedDesignerCardExample:1,officialExistenceOnly:2,verifiedGeneralDefinitions:0,appDefinitionsAdded:0},
 rulesPdf:source('https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf'),rulesPdfCheck:artifact('cr-pdf-check.json'),
 successorReleasePdf:source('https://media.wizards.com/2024/downloads/MB2_Release_Notes_OFjn1qzZAq/EN_MTGMB2_ReleaseNotes_20241003.pdf'),successorReleasePdfCheck:artifact('mb2-pdf-check.json'),
 priorCardEvidence:{file:'../catalog-gaps-20261019/verification.json',sha256:hash(fs.readFileSync('reports/catalog-gaps-20261019/verification.json'))},
 rows,
 confidence:'High for the specific source observations and unchanged application hashes. No assertion that an unfound source does not exist, or that these references establish universal mechanic definitions.'};
fs.writeFileSync(`${dir}/findings.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.summary));
