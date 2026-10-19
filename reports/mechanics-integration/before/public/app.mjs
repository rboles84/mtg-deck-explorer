import {parseDeck, resolveDeck, commanderContext, analyzeFlavor, detectMechanics} from './core.mjs';
import {createDemoDeck} from './demo.mjs';
import {addClipboard, setClipboardQuantity, removeClipboard, clearClipboard, exportClipboard, loadClipboard, saveClipboard} from './clipboard.mjs';
import {manaSymbols, identitySymbols, setSymbol, describeSetSymbol} from './symbols.mjs';
import {cardTrigger, cardVisual, installCardPreviews, closeCardPreview} from './card-preview.mjs';
import {ruleBody, closeRulePreview} from './rules-ui.mjs';
import {clipboardPageView} from './collection-view.mjs';

const $ = id => document.getElementById(id);
const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
const button = (label, action, className) => {const el = node('button', label, className); el.type = 'button'; el.addEventListener('click', action); return el;};
const append = (parent, ...children) => {parent.append(...children.filter(Boolean)); return parent;};
const colors = {W:'White', U:'Blue', B:'Black', R:'Red', G:'Green'};
const knownCards = new Map();
function cardHeading(card, fallback, synthetic = false) {
  return append(node('h3'), card ? cardTrigger(card,{label:fallback || card.name,synthetic}) : document.createTextNode(fallback || 'Unrecognized input'));
}
function printingMeta(card, fallback = {}) {
  const meta=node('div',undefined,'printing-label');
  if(card&&describeSetSymbol(card).supported)meta.append(setSymbol(card));
  meta.append(document.createTextNode(`${(card?.set||fallback.set||'SET UNKNOWN').toUpperCase()} / ${card?.collector_number||fallback.collectorNumber||'PRINTING UNKNOWN'} · ${card?.lang||fallback.language||'language unspecified'}${fallback.section?` · ${fallback.section}`:''}`));
  return meta;
}
function externalLink(text, url) {
  const el = node('a', text);
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || !['scryfall.com','magic.wizards.com','media.wizards.com'].includes(parsed.hostname)) return node('span',text); el.href = parsed.href; }
  catch {return node('span',text);}
  el.target='_blank'; el.rel='noreferrer'; return el;
}
function safeStatus(el, message, error = false) {el.textContent = message; el.classList.toggle('error',error);}
let importedDeck = null, selectedCommanderRows, identity = null, analysis = null, selectedObservation = null;
let contextToken = null, catalog = null, selectedMechanicId = null, discoveries = null, importBusy = false, searchBusy = false, contextGeneration = 0;
let rulesData = null, clipboardPage = 1;
const restored = loadClipboard(); let clipboardItems = restored.items;
$('storage-status').textContent = restored.message || 'Saved for this tab. Separate from your imported deck.';
const modalTriggers = new Map();
function openDialog(dialog) {closeCardPreview();closeRulePreview();hideIdentityTip();modalTriggers.set(dialog, document.activeElement); dialog.showModal();}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const focusable=[...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length);
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  dialog.addEventListener('close',()=>{const trigger=modalTriggers.get(dialog);(trigger?.isConnected?trigger:$('clipboard-open')).focus({preventScroll:true});});
}
installCardPreviews();
$('clipboard-open').addEventListener('click',()=>{renderClipboard();openDialog($('clipboard-dialog'));});
$('ledger-open').addEventListener('click',()=>{renderLedger();openDialog($('ledger-dialog'));});
async function api(path,payload) {
  const response = await fetch(path, payload === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  let data; try {data = await response.json();} catch {throw new Error('The local server returned an unreadable response.');}
  if (!response.ok) throw new Error(`${data.error || `HTTP ${response.status}`}${response.headers.get('retry-after') ? ` Wait at least ${response.headers.get('retry-after')} seconds before trying again.` : ''}`);
  return data;
}
function showView(view) {
  closeCardPreview();
  $('archive-view').hidden = view !== 'archive'; $('mechanics-view').hidden = view !== 'mechanics';
  $('archive-tab').setAttribute('aria-pressed',String(view === 'archive'));
  $('mechanics-tab').setAttribute('aria-pressed',String(view === 'mechanics'));
  setStage(view==='archive'?'read':'understand');
}
function setStage(stage) {document.querySelectorAll('.workflow [data-stage]').forEach(el=>{if(el.dataset.stage===stage)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});}
function followRoute(hash, focus = false) {
  const target=document.querySelector(['#main','#import-workbench','#archive-view','#mechanics-view','#discovery'].includes(hash)?hash:'#main');
  if(hash==='#import-workbench'){$('import-workbench').open=true;setStage('import');}
  if(hash==='#archive-view')showView('archive');
  if(hash==='#mechanics-view'||hash==='#discovery'){showView('mechanics');if(hash==='#discovery')setStage('explore');}
  closeCardPreview();
  target.scrollIntoView({block:'start',behavior:'instant'});
  if(focus){const focusTarget=hash==='#import-workbench'?$('deck-input'):hash==='#main'?document.querySelector('.brand'):target;focusTarget.focus({preventScroll:true});}
}
function navigate(hash) {if(location.hash!==hash)history.pushState(null,'',hash);followRoute(hash,true);}
window.addEventListener('hashchange',()=>followRoute(location.hash,true));
for(const link of document.querySelectorAll('.workflow a,.brand'))link.addEventListener('click',event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate(link.getAttribute('href'));});
for(const control of document.querySelectorAll('.workflow button'))control.addEventListener('click',()=>{renderClipboard();openDialog($('clipboard-dialog'));if(control.dataset.stage==='export'){$('export-details').open=true;$('clipboard-export').focus();}});
$('archive-tab').addEventListener('click',()=>navigate('#archive-view'));
$('mechanics-tab').addEventListener('click',()=>navigate('#mechanics-view'));
function hideIdentityTip() {$('identity-tip').hidden=true;document.querySelectorAll('.pip[aria-describedby]').forEach(el=>el.removeAttribute('aria-describedby'));}
function identityMessage(code) {return !identity?.colorIdentity?`${colors[code]} · Choose a resolved commander to establish its identity.`:`${colors[code]} · ${identity.colorIdentity.includes(code)?'Included in':'Outside'} the selected commander identity.`;}
let identityTipTimer;
for(const pip of document.querySelectorAll('.dial .pip')) {
  const code=pip.dataset.color;pip.replaceChildren(manaSymbols(`{${code}}`));pip.setAttribute('aria-haspopup','dialog');
  const reveal=()=>{clearTimeout(identityTipTimer);$('identity-tip').textContent=identityMessage(code);$('identity-tip').hidden=false;pip.setAttribute('aria-describedby','identity-tip');};
  pip.addEventListener('pointerenter',reveal);pip.addEventListener('focus',reveal);
  pip.addEventListener('pointerleave',()=>{identityTipTimer=setTimeout(hideIdentityTip,120);});pip.addEventListener('blur',hideIdentityTip);
  pip.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();hideIdentityTip();}});
  pip.addEventListener('click',()=>{$('evidence-title').textContent=`${colors[code]} in your commander identity`;
    const content=$('evidence-content');content.replaceChildren(identitySymbols([code]),node('p',identityMessage(code)),node('p','Color identity comes from the selected resolved commander records. This boundary is used for discovery searches; it does not change your imported deck.','fine'));
    if(identity?.provisional)content.append(node('p','Provisional union; commander pair eligibility is unverified.','fine'));
    for(const row of importedDeck?.rows.filter(row=>identity.rowIds.includes(row.id))||[])content.append(cardHeading(row.card,row.card.name,importedDeck.synthetic));
    openDialog($('evidence-dialog'));
  });
}
$('identity-tip').addEventListener('pointerenter',()=>clearTimeout(identityTipTimer));$('identity-tip').addEventListener('pointerleave',hideIdentityTip);
document.addEventListener('scroll',hideIdentityTip,true);
$('import-button').addEventListener('click',async()=>{
  if(importBusy)return;
  let parsed;
  try {parsed=parseDeck($('deck-input').value);if(!parsed.rows.length)throw new Error('Paste a deck export before importing.');}
  catch(error){safeStatus($('import-message'),error.message,true);return;}
  importBusy=true; $('import-button').disabled=true; $('demo-button').disabled=true;
  $('import-button').textContent='Resolving printings…'; safeStatus($('import-message'),`Resolving ${parsed.identifiers.length} distinct printing identifiers through Scryfall…`);
  contextGeneration++;contextToken=null; selectedCommanderRows=undefined; discoveries=null; selectedObservation=null;renderMechanics();renderDiscoveries();
  try {
    const result = parsed.identifiers.length ? await api('/api/resolve',{identifiers:parsed.identifiers}) : {cards:[],notFound:[],contextToken:null};
    contextToken=result.contextToken; importedDeck=resolveDeck(parsed,result.cards,result.notFound);
    renderDeck();
    safeStatus($('import-message'),`${importedDeck.counts.resolvedEntries} main-deck entries resolved; ${importedDeck.counts.unresolvedEntries} need attention.${result.warnings?.length ? ` ${result.warnings.join(' ')}` : ''}`);
    if(importedDeck.counts.resolvedEntries){$('import-workbench').open=false;$('archive-tab').focus();}
  } catch(error) {
    importedDeck=resolveDeck(parsed,[],[]);renderDeck();safeStatus($('import-message'),error.message,true);
    $('mode-banner').hidden=false;$('mode-banner').textContent='LIVE DATA UNAVAILABLE · Your imported lines remain in the archive as unresolved. No fixture data was substituted.';
  } finally {importBusy=false;$('import-button').disabled=false;$('demo-button').disabled=false;$('import-button').textContent='Import exact printings →';}
});
$('demo-button').addEventListener('click',()=>{
  contextGeneration++;importedDeck=createDemoDeck(); contextToken=null;selectedCommanderRows=undefined;discoveries=null;selectedObservation=null;
  renderDeck();$('import-workbench').open=false;safeStatus($('import-message'),'Synthetic fixture loaded. No Scryfall requests were made.');$('archive-tab').focus();
});
function renderDeck() {
  closeCardPreview();
  identity=commanderContext(importedDeck,selectedCommanderRows);analysis=analyzeFlavor(importedDeck);
  for(const row of importedDeck.rows)if(row.card)knownCards.set(row.card.id,row.card);
  $('clear-observation').hidden=!selectedObservation;
  $('ledger-section').hidden=false;$('archive-empty').hidden=true;$('archive-content').hidden=false;
  $('mode-banner').hidden=!importedDeck.synthetic;
  $('mode-banner').textContent='SYNTHETIC FIXTURE MODE · Invented cards and authored sample passages. This is a UX demonstration, not verified Magic or Scryfall data. Live discovery and Clipboard collection require a real import.';
  $('identity-name').textContent=identity.colorIdentity?'Your colors':'Awaiting your deck';
  $('identity-caption').textContent=identity.provisional?'Combined commander identity · pair eligibility unverified':identity.colorIdentity ? 'From your selected commander.':'Choose a commander below.';
  document.querySelectorAll('.dial .pip').forEach(p=>{p.classList.toggle('active',Boolean(identity.colorIdentity?.includes(p.dataset.color)));p.setAttribute('aria-label',`${identityMessage(p.dataset.color)} Inspect details`);});
  const commanders=importedDeck.rows.filter(row=>identity.rowIds.includes(row.id));
  $('header-status').textContent=commanders.length?`${importedDeck.synthetic?'Fixture · ':''}${commanders.map(row=>row.card.name).join(' + ')}`:'Commander selection needed';
  $('import-summary').textContent=`${importedDeck.counts.playableEntries} entries · ${importedDeck.counts.resolvedEntries} resolved · Open workbench`;
  const denominators=$('denominators');denominators.replaceChildren();
  for(const [count,label] of [[importedDeck.counts.playableQuantity,'physical cards'],[importedDeck.counts.playableEntries,'input entries'],[importedDeck.counts.distinctPrintings,'resolved printings'],[analysis.passages.length,'passages']]) append(denominators,append(node('span'),node('b',String(count)),document.createTextNode(label)));
  $('commander-caption').replaceChildren(identity.colorIdentity?identitySymbols(identity.colorIdentity):document.createTextNode('Identity unknown'));
  if(identity.provisional)$('commander-caption').append(document.createTextNode(' Combined identity'));
  const current=$('commander-current');current.replaceChildren();
  for(const row of commanders){const item=node('div',undefined,'selected-commander');const copy=append(node('div',undefined,'commander-copy'),node('h3',row.card.name),printingMeta(row.card),node('p','Select the card to inspect its rules and printing.','fine'));append(item,cardVisual(row.card,{className:'commander-visual',synthetic:importedDeck.synthetic}),copy);current.append(item);}
  if(!commanders.length)current.append(node('p','Choose one or two resolved imported cards to establish a discovery boundary.','fine'));
  $('commander-picker').open ||= !commanders.length;
  const options=$('commander-options');options.replaceChildren();
  for(const row of importedDeck.rows.filter(row=>row.playable&&row.status==='resolved')) {
    const option=node('div',undefined,'commander-option');option.dataset.name=row.card.name.toLocaleLowerCase('en');
    const label=node('label'),input=node('input');input.type='checkbox';input.value=row.id;input.checked=identity.rowIds.includes(row.id);input.setAttribute('aria-label',`Select ${row.card.name} (${row.card.set.toUpperCase()}) ${row.card.collector_number} as commander`);
    append(label,input,document.createTextNode(row.card.name));append(option,label,printingMeta(row.card),cardTrigger(row.card,{label:'Inspect',className:'commander-inspect',synthetic:importedDeck.synthetic}));options.append(option);
  }
  filterCommanders();
  $('analysis-summary').textContent=analysis.summary;
  const observations=$('observation-list');observations.replaceChildren();
  // A short index; every displayed observation has exact, inspectable evidence.
  const words=analysis.observations.filter(o=>o.kind==='word').slice(0,6);
  const phrases=analysis.observations.filter(o=>o.kind==='phrase').slice(0,3);
  for(const observation of [...words,...phrases]) {
    const el=button('',()=>selectObservation(observation),'observation');el.dataset.observation=observation.id;
    el.classList.toggle('selected',selectedObservation?.id===observation.id);
    append(el,node('span',observation.term),node('span',`${observation.distinctCards} cards ↗`));observations.append(el);
  }
  const method=$('analysis-method');method.replaceChildren(
    node('p','We look for repeated whole words and short phrases in English flavor text. A term must appear on at least two different cards with different passages. Repeated copies of the same passage count only once.'),
    node('p',`${analysis.counts.englishPassages} English passages were checked. Common connecting words and very short words are omitted. This describes wording, rather than claiming a shared story or theme.`));
  renderArchive();renderMechanics();renderDiscoveries();
}
$('commander-apply').addEventListener('click',()=>{
  contextGeneration++;selectedCommanderRows=[...$('commander-options').querySelectorAll('input:checked')].map(el=>el.value);discoveries=null;renderDeck();
  $('commander-picker').open=false;($('commander-current').querySelector('button')||$('commander-picker').querySelector('summary')).focus({preventScroll:true});
});
function filterCommanders(){const query=$('commander-search').value.trim().toLocaleLowerCase('en');let shown=0;for(const option of $('commander-options').children){option.hidden=!option.dataset.name.includes(query);if(!option.hidden)shown++;}$('commander-option-status').textContent=`${shown} resolved cards shown. Selection is retained when filtering.`;}
$('commander-search').addEventListener('input',filterCommanders);
function rowFlags(row) {
  return [...row.issues, ...(identity?.offIdentityRowIds.includes(row.id)?['Observed outside the selected commander color identity.']:[]),...(identity?.nonLegalRowIds.includes(row.id)?[`Scryfall Commander status: ${row.card.legalities.commander}.`]:[])];
}
function highlight(text,spans=[]) {
  const fragment=document.createDocumentFragment(); let cursor=0;
  const sorted=spans.slice().sort((a,b)=>a.start-b.start);
  for(const span of sorted){if(span.start<cursor)continue;fragment.append(document.createTextNode(text.slice(cursor,span.start)),node('mark',text.slice(span.start,span.end)));cursor=span.end;}
  fragment.append(document.createTextNode(text.slice(cursor)));return fragment;
}
function renderArchive() {
  if(!importedDeck)return;
  closeCardPreview();
  const list=$('archive-list');list.replaceChildren();
  const query=$('archive-search').value.trim().toLocaleLowerCase('en'),filter=$('archive-filter').value;
  const playable=importedDeck.rows.filter(row=>row.playable);
  let shown=0;
  playable.forEach((row,index)=>{
    const passages=analysis.passages.filter(p=>p.rowId===row.id);
    const hasFlavor=passages.length>0;
    if((filter==='flavor'&&!hasFlavor)||(filter==='absent'&&(row.status!=='resolved'||hasFlavor))||(filter==='unresolved'&&row.status==='resolved'))return;
    if(query&&!`${row.name} ${row.set} ${row.collectorNumber} ${passages.map(p=>p.text).join(' ')}`.toLocaleLowerCase('en').includes(query))return;
    shown++;
    const article=node('article',undefined,'archive-entry');article.id=`entry-${row.id}`;
    article.append(node('span',String(index+1).padStart(2,'0'),'entry-index'));
    const content=node('div',undefined,'archive-entry-layout'),reading=node('div',undefined,'archive-reading');
    const heading=append(node('div',undefined,'entry-header'),append(node('div'),cardHeading(row.card,row.name,importedDeck.synthetic),printingMeta(row.card,row)));
    reading.append(heading);
    if(hasFlavor){
      for(const passage of passages){
        const figure=node('figure',undefined,'passage');
        if(passage.faceIndex!==null)figure.append(node('div',passage.faceName,'face-label'));
        const quote=node('blockquote');quote.append(highlight(passage.text,selectedObservation?.evidence.filter(e=>e.passageId===passage.id)||[]));figure.append(quote);
        reading.append(figure);
      }
    }else reading.append(node('p',row.status==='resolved'?'This printing has no flavor text.':row.status==='printing-unknown'?'Printing unknown — exact text cannot be recovered.':`Printing unresolved · ${row.status}`,'no-flavor'));
    const flags=rowFlags(row);if(flags.length)reading.append(node('p',flags.join(' '),'entry-flags'));
    content.append(reading);
    const details=append(node('details',undefined,'archive-printing-details'),node('summary','About this printing'));details.open=true;
    details.append(node('p',`${Number.isFinite(row.quantity)?row.quantity:'?'} ${row.quantity===1?'copy':'copies'} · Imported line ${row.lineNumber}`,'fine'));
    if(hasFlavor)details.append(node('p',importedDeck.synthetic?'Authored sample passage.':'Flavor text from this exact edition.','fine'));
    if(row.card?.scryfall_uri)details.append(externalLink('Edition on Scryfall ↗',row.card.scryfall_uri));
    content.append(details);
    article.append(content);list.append(article);
  });
  $('archive-count').textContent=`${shown} of ${playable.length} entries`;
  if(!shown)list.append(node('p','No entries match this view. Try another filter or search.','empty-message'));
}
$('archive-search').addEventListener('input',renderArchive);$('archive-filter').addEventListener('change',renderArchive);
function evidenceBlock(passage, spans=[]) {
  const card=knownCards.get(passage.printingId),row=importedDeck.rows.find(row=>row.id===passage.rowId);
  const article=node('article',undefined,'evidence-item evidence-card-layout'),copy=node('div',undefined,'evidence-copy');
  if(card)article.append(cardVisual(card,{synthetic:importedDeck.synthetic,compact:true}));
  append(copy,cardHeading(card,passage.name,importedDeck.synthetic),printingMeta(card,{set:passage.set,collectorNumber:passage.collectorNumber,language:passage.language}));
  if(passage.faceIndex!==null)copy.append(node('p',`From ${passage.faceName}`,'face-label'));
  const quote=node('blockquote');quote.append(highlight(passage.text,spans));copy.append(quote);
  copy.append(node('p',`${row?.quantity||1} ${row?.quantity===1?'copy':'copies'} in your imported deck${spans.length?` · ${spans.length} ${spans.length===1?'match':'matches'} in this passage`:''}.`,'fine'));
  const details=append(node('details',undefined,'technical-details'),node('summary','About this printing'));
  append(details,node('p',importedDeck.synthetic?'Authored demonstration passage.':'Flavor text is from this exact edition. Rules in the card viewer use current Oracle text.'),node('p',`Printing identifier: ${passage.printingId}`,'mono'));
  if(row)details.append(node('p',`From line ${row.lineNumber} of your import · ${row.section}.`,'fine'));
  if(passage.scryfallUri)details.append(externalLink('View this edition on Scryfall ↗',passage.scryfallUri));
  copy.append(details);article.append(copy);
  return article;
}
function selectObservation(observation) {
  selectedObservation=observation;$('clear-observation').hidden=false;
  document.querySelectorAll('.observation').forEach(el=>el.classList.toggle('selected',el.dataset.observation===observation.id));renderArchive();
  $('evidence-title').textContent=`“${observation.term}” in your deck`;
  const evidence=$('evidence-content');evidence.replaceChildren(
    node('p',`${observation.distinctCards} cards · ${observation.rawHits} mentions · ${observation.independentPassages} different passages`,'evidence-stats'),node('p','The matching words are highlighted below. Repeated copies of the same passage count once when finding shared wording.','fine'));
  for(const passageId of new Set(observation.evidence.map(e=>e.passageId))){const passage=analysis.passages.find(p=>p.id===passageId);const spans=observation.evidence.filter(e=>e.passageId===passageId);evidence.append(evidenceBlock(passage,spans));}
  openDialog($('evidence-dialog'));
}
$('clear-observation').addEventListener('click',()=>{selectedObservation=null;$('clear-observation').hidden=true;document.querySelectorAll('.observation').forEach(el=>el.classList.remove('selected'));renderArchive();});
function renderLedger() {
  const list=$('ledger-list');list.replaceChildren();if(!importedDeck)return;
  list.append(node('p',`${importedDeck.counts.entries} total entries, ${importedDeck.counts.playableEntries} analyzed; ${importedDeck.counts.excludedEntries} excluded side entries. ${importedDeck.counts.resolvedEntries} resolved, ${importedDeck.counts.unresolvedEntries} unresolved (including ${importedDeck.counts.ambiguousEntries} ambiguous); ${importedDeck.counts.flavorAbsentEntries} resolved entries without flavor.`,'fine'));
  list.append(node('p',`${identity.label}. ${identity.issues.join(' ')}`,'fine'));
  for(const row of importedDeck.rows){const article=node('article',undefined,'ledger-row');append(article,node('h3',`${row.lineNumber}. ${row.name || 'Invalid line'}`),node('p',`${row.section} · quantity ${row.quantity} · ${row.status}${row.playable?'':' · EXCLUDED from analysis'}${identity.rowIds.includes(row.id)?' · SELECTED COMMANDER':''}`,'micro'),node('pre',row.originalLine),node('p',rowFlags(row).join(' ')));if(row.card)article.append(node('p',`Returned: ${row.card.name} · ${row.card.set.toUpperCase()} ${row.card.collector_number} · ${row.card.lang} · ${row.card.id}`,'mono'));if(row.returnedPrinting)article.append(node('pre',`Mismatch record: ${JSON.stringify(row.returnedPrinting)}`));list.append(article);}
}
function renderMechanics() {
  const focusKey=document.activeElement?.dataset.mechanicFocus;
  const restoreFocus=()=>{if(!focusKey)return;const target=[...document.querySelectorAll('[data-mechanic-focus]')].find(el=>el.dataset.mechanicFocus===focusKey&&!el.disabled)||$('mechanic-context').querySelector('h2');target?.focus({preventScroll:true});};
  const detected=$('detected-list');detected.replaceChildren();
  const found=importedDeck&&catalog?detectMechanics(importedDeck,catalog):[];
  if(!found.length)detected.append(node('p',importedDeck?'No supported keyword evidence observed.':'Import a deck to inspect its card evidence.','fine'));
  for(const item of found){const trigger=button(`${item.master_name} · ${item.distinctCards} cards ↗`,()=>{selectedMechanicId=item.atlas_row_id;renderMechanics();$('mechanic-context').scrollIntoView({block:'start'});},'detected-button');trigger.setAttribute('aria-pressed',String(selectedMechanicId===item.atlas_row_id));trigger.dataset.mechanicFocus=`detected-${item.atlas_row_id}`;detected.append(trigger);}
  const choices=$('mechanic-list');choices.replaceChildren();
  if(!catalog){choices.append(node('p','Source catalog unavailable. Import and flavor reading remain available.','fine'));return;}
  selectedMechanicId ||= catalog.records[0]?.atlas_row_id;
  for(const record of catalog.records){const available=identity?.colorIdentity?.filter(c=>record.placement?.colors?.[c]);const el=button('',()=>{selectedMechanicId=record.atlas_row_id;renderMechanics();},'mechanic-choice');el.dataset.mechanicFocus=`choice-${record.atlas_row_id}`;el.setAttribute('aria-pressed',String(selectedMechanicId===record.atlas_row_id));append(el,document.createTextNode(record.master_name),available?.length?identitySymbols(available):node('span','Pool ↗'));choices.append(el);}
  const record=catalog.records.find(r=>r.atlas_row_id===selectedMechanicId);if(!record)return;
  const context=$('mechanic-context');context.replaceChildren(node('span',record.master_category.replaceAll('_',' '),'eyebrow'),node('h2',record.master_name));
  context.querySelector('h2').tabIndex=-1;context.querySelector('h2').dataset.mechanicFocus='context-title';
  const ruleNumber=record.rules_reference.section.replace(/^CR\s+/,''),rules=node('section',undefined,'rules-card');
  append(rules,append(node('div',undefined,'rules-heading'),node('h3','How it works')),ruleBody(rulesData,ruleNumber,{onOpen:showRule}));context.append(rules);
  const item=found.find(r=>r.atlas_row_id===record.atlas_row_id),deckCards=node('section',undefined,'mechanic-deck-cards');
  deckCards.append(node('h3',item?`${record.master_name} in your deck · ${item.distinctCards} cards`:`No ${record.master_name} matches in your deck`));
  if(item){
    deckCards.append(node('p','Select a card to read its rules. Some cards grant this ability to others; a match does not always mean the card itself has it.','fine'));
    const grid=node('div',undefined,'deck-card-grid');
    for(const id of new Set(item.evidence.map(e=>e.printingId))){const card=knownCards.get(id);if(!card)continue;const tile=node('article',undefined,'visual-card');append(tile,cardVisual(card,{synthetic:importedDeck.synthetic}),cardHeading(card),printingMeta(card));grid.append(tile);}
    deckCards.append(grid);
  }else deckCards.append(node('p','The supported keyword data did not report this mechanic. Your imported cards are unchanged.','fine'));
  context.append(deckCards);
  const history=append(node('details',undefined,'color-history'),node('summary',`How the colors use ${record.master_name}`));
  if(record.placement){
    history.append(node('p','A historical view of color design. Primary, secondary and tertiary describe how often a color receives an ability, not its strength.','fine'));
    const table=node('table',undefined,'placement-table');const header=node('tr');append(header,node('th','Color'),node('th','2021 placement'),node('th','Commander identity'));table.append(append(node('thead'),header));
    const body=node('tbody');
    for(const [code,name] of Object.entries(colors)){const place=record.placement.colors?.[code];const tier=typeof place==='string'?place:place?.tier;append(body,append(node('tr'),append(node('td'),identitySymbols([code]),document.createTextNode(` ${name}`)),node('td',tier?`${tier[0].toUpperCase()}${tier.slice(1)}`:'No placement'),node('td',identity?.colorIdentity===null||!identity?'Not selected':identity.colorIdentity.includes(code)?'Selected':'—')));}
    table.append(body);history.append(table);
    if(record.placement.explanation)history.append(node('p',record.placement.explanation,'source-explanation'));
    history.append(node('p','Based on the 2021 color-pie article. Individual sets may depart from this pattern. Full source information is in the footer.','fine'));
  } else history.append(node('p','No linked historical placement is available.','fine'));
  context.append(history);
  const box=queryBox(record,buildVisibleQuery(record));context.append(box);
  const run=button(searchBusy?'Searching Scryfall…':`Search ${record.master_name} cards →`,()=>runDiscovery(record),'primary');
  run.dataset.mechanicFocus='run-discovery';
  run.disabled=searchBusy||!contextToken||!identity?.colorIdentity||identity.rowIds.length>2||importedDeck?.synthetic;context.append(run);
  if(run.disabled&&!searchBusy)context.append(node('p',importedDeck?.synthetic?'Live discovery is unavailable in synthetic fixture mode. Import a real deck to use a server-validated commander identity.':'Import a real deck and select one or two resolved commanders to search.','fine'));
  restoreFocus();
}
function showRule(number){
  const dialog=$('evidence-dialog'),wasOpen=dialog.open,section=rulesData?.sections?.[number];
  $('evidence-title').textContent=`${number}. ${section?.title||'Official rule'}`;
  $('evidence-content').replaceChildren(ruleBody(rulesData,number,{onOpen:showRule}),node('p','Official Comprehensive Rules · September 25, 2026.','fine'));
  if(!wasOpen)openDialog(dialog);else{closeRulePreview();dialog.querySelector('.close-dialog').focus();}
}
function buildVisibleQuery(record) {if(!identity?.colorIdentity)return 'Choose a commander to search.';return `(f:commander id<=${identity.colorIdentity.join('').toLowerCase()||'c'}) (${record.atlas.query})`;}
function queryBox(record,query,url) {
  const box=node('div',undefined,'query-box');append(box,node('h3',`Find ${record.master_name} cards`));
  const description=node('p','Commander-legal cards within your commander’s colors ');if(identity?.colorIdentity)description.append(identitySymbols(identity.colorIdentity));box.append(description);
  const details=append(node('details'),node('summary','How this search works'));
  append(details,node('p',`Matches the ${record.master_name} keyword without using colors outside your commander’s identity. Fewer-color and colorless cards are included. It does not search rules text for every card that grants the ability.`),node('p','Browse 24 distinct cards per page, using a recent printing of each. Saving a card keeps that edition in your separate Clipboard. Use the page controls to explore every match.'),node('code',query));box.append(details);
  if(url)box.append(externalLink('Open on Scryfall ↗',url));return box;
}
async function runDiscovery(record,page=1,continuation=false) {
  if(searchBusy)return;
  const generation=contextGeneration,previous=continuation?discoveries:null,pageCache=previous?.pageCache||new Map();
  searchBusy=true;renderMechanics();renderDiscoveryPagination();$('discovery-results').setAttribute('aria-busy','true');
  safeStatus($('discovery-status'),`Loading ${record.master_name} cards${continuation?` · page ${page}`:''}…`);
  try {
    const commanderIds=[...new Set(importedDeck.rows.filter(r=>identity.rowIds.includes(r.id)).map(r=>r.card.id))];
    const result=pageCache.get(page)||await api('/api/discover',{atlasRowId:record.atlas_row_id,contextToken,commanderIds,page});
    if(generation===contextGeneration){pageCache.set(page,result);discoveries={...result,record,pageCache};renderDiscoveries();navigate('#discovery');}
  }catch(error){if(generation===contextGeneration){discoveries=previous;renderDiscoveries();safeStatus($('discovery-status'),`${error.message}${previous?' Your previous page is still here.':''}`,true);}}
  finally{searchBusy=false;$('discovery-results').setAttribute('aria-busy','false');renderMechanics();renderDiscoveryPagination();if(generation!==contextGeneration)renderDiscoveries();else if(continuation&&discoveries){$('discovery-pages-top').scrollIntoView({block:'start',behavior:'instant'});$('discovery-page-top')?.focus({preventScroll:true});}}
}
function discoverySummary(){
  if(!discoveries)return '';
  const start=(discoveries.page-1)*24+1,end=Math.min(discoveries.page*24,discoveries.totalCards);
  return `${discoveries.totalCards?`${start}–${end} of ${discoveries.totalCards.toLocaleString()} distinct cards`:'No matching cards'}${discoveries.skipped?` · ${discoveries.skipped} results could not be shown safely`:''}`;
}
function renderDiscoveryPagination(){
  for(const position of ['top','bottom']){
    const nav=$(`discovery-pages-${position}`);nav.replaceChildren();nav.hidden=!discoveries?.totalCards;
    if(nav.hidden)continue;
    const previous=button('← Previous',()=>runDiscovery(discoveries.record,discoveries.page-1,true));previous.disabled=searchBusy||discoveries.page<=1;previous.setAttribute('aria-label','Previous discovery page');
    const next=button('Next →',()=>runDiscovery(discoveries.record,discoveries.page+1,true));next.disabled=searchBusy||!discoveries.hasMore;next.setAttribute('aria-label','Next discovery page');
    const label=node('label',undefined,'discovery-page-label'),select=node('select');select.id=`discovery-page-${position}`;select.setAttribute('aria-label',position==='top'?'Discovery page':'Discovery page below results');select.disabled=searchBusy;
    for(let page=1;page<=discoveries.totalPages;page++){const option=node('option',String(page));option.value=String(page);option.selected=page===discoveries.page;select.append(option);}
    select.addEventListener('change',()=>runDiscovery(discoveries.record,Number(select.value),true));
    append(label,document.createTextNode('Page '),select,document.createTextNode(` of ${discoveries.totalPages}`));append(nav,previous,label,next);
  }
}
function saveDiscoveryCard(card,queryId){
  clipboardItems=addClipboard(clipboardItems,card,queryId);persistClipboard();renderClipboard();
  const quantity=clipboardItems.find(item=>item.id===card.id).quantity;
  safeStatus($('discovery-status'),`${discoverySummary()}. Saved ${card.name} · ${quantity} in Clipboard.`);
  return quantity;
}
function renderDiscoveries() {
  const results=$('discovery-results'),query=$('discovery-query');results.replaceChildren();query.replaceChildren();
  renderDiscoveryPagination();
  if(!discoveries){if(!searchBusy)safeStatus($('discovery-status'),'No discovery search has been run for this commander context.');return;}
  safeStatus($('discovery-status'),discoverySummary());
  query.append(queryBox(discoveries.record,discoveries.providerQuery||discoveries.query,discoveries.scryfallUrl));
  if(!discoveries.cards.length)results.append(node('p','No compatible candidates were returned. The search was not broadened.','empty-message'));
  const queryId=discoveries.record.atlas_row_id;
  for(const card of discoveries.cards){knownCards.set(card.id,card);const article=node('article',undefined,'result-card visual-card');
    const saveAction={getQuantity:()=>clipboardItems.find(item=>item.id===card.id)?.quantity||0,onSave:()=>saveDiscoveryCard(card,queryId)};
    const imageArea=node('div',undefined,'result-image');imageArea.append(cardVisual(card,{saveAction}));
    const saved=clipboardItems.find(item=>item.id===card.id)?.quantity||0;
    const add=button(saved?`Saved ×${saved}`:'▤ Save',()=>{try{saveAction.onSave();}catch(error){safeStatus($('discovery-status'),error.message,true);}},'save-card');
    add.setAttribute('aria-label',`Save ${card.name} to Clipboard`);add.dataset.printingId=card.id;if(saved)add.classList.add('is-saved');
    append(article,imageArea,append(node('div',undefined,'result-actions-compact'),add));results.append(article);
  }
}
function persistClipboard() {const result=saveClipboard(clipboardItems);$('storage-status').textContent=result.message||'Saved for this tab. Separate from your imported deck.';}
function syncSaveButtons(){for(const save of document.querySelectorAll('.save-card[data-printing-id]')){const quantity=clipboardItems.find(item=>item.id===save.dataset.printingId)?.quantity||0;save.textContent=quantity?`Saved ×${quantity}`:'▤ Save';save.classList.toggle('is-saved',quantity>0);}}
function renderClipboard() {
  syncSaveButtons();
  const list=$('clipboard-list');list.replaceChildren();const count=clipboardItems.reduce((n,item)=>n+item.quantity,0);$('clipboard-count').textContent=String(count);$('clipboard-open').setAttribute('aria-label',`Discovery Clipboard, ${count} cards`);
  const view=clipboardPageView(clipboardItems,$('clipboard-search').value,clipboardPage);clipboardPage=view.page;
  $('clipboard-summary').textContent=`${clipboardItems.length} printings · ${count} cards`;
  if(!clipboardItems.length)list.append(node('p','Nothing collected yet. Run a mechanic search and choose a printing to keep.','empty-message'));
  else if(!view.total)list.append(node('p','No saved printings match this search.','empty-message'));
  for(const item of view.items){const card=knownCards.get(item.id)||{id:item.id,name:item.name,set:item.set,collector_number:item.collectorNumber,lang:item.language,scryfall_uri:`https://scryfall.com/card/${item.id}`};const article=node('article',undefined,'clipboard-item clip-item');
    const copy=append(node('div',undefined,'clip-copy'),cardHeading(card),printingMeta(card));append(article,append(node('div',undefined,'clip-thumb'),cardVisual(card,{compact:true})),copy);
    const controls=node('div',undefined,'clipboard-controls clip-controls'),label=node('label'),input=node('input');input.type='number';input.min='1';input.max='999';input.step='1';input.value=String(item.quantity);input.setAttribute('aria-label',`Quantity for ${item.name} (${item.set.toUpperCase()}) ${item.collectorNumber}`);
    const updateQuantity=()=>{try{clipboardItems=setClipboardQuantity(clipboardItems,item.id,Number(input.value));persistClipboard();syncSaveButtons();$('clipboard-export').value=exportClipboard(clipboardItems);const total=clipboardItems.reduce((n,i)=>n+i.quantity,0);$('clipboard-count').textContent=String(total);$('clipboard-summary').textContent=`${clipboardItems.length} printings · ${total} cards`;$('clipboard-open').setAttribute('aria-label',`Discovery Clipboard, ${total} cards`);safeStatus($('copy-status'),'');}catch(error){safeStatus($('copy-status'),error.message,true);}};
    input.addEventListener('input',updateQuantity);input.addEventListener('change',updateQuantity);
    const remove=button('×',()=>{clipboardItems=removeClipboard(clipboardItems,item.id);persistClipboard();renderClipboard();$('clipboard-search').focus();},'clip-remove');remove.setAttribute('aria-label',`Remove ${item.name} (${item.set.toUpperCase()}) ${item.collectorNumber}`);label.append(input);append(controls,label,remove);article.append(controls);list.append(article);
  }
  $('clipboard-page-label').textContent=`Page ${view.page} of ${view.pages}${$('clipboard-search').value?` · ${view.total} matches`:''}`;
  $('clipboard-previous').disabled=view.page===1;$('clipboard-next').disabled=view.page===view.pages;
  $('clipboard-export').value=exportClipboard(clipboardItems);$('copy-printings').disabled=!clipboardItems.length;$('clear-clipboard').disabled=!clipboardItems.length;
}
$('clipboard-search').addEventListener('input',()=>{clipboardPage=1;renderClipboard();});
$('clipboard-previous').addEventListener('click',()=>{clipboardPage--;renderClipboard();$('clipboard-list').scrollTop=0;$('clipboard-search').focus();});
$('clipboard-next').addEventListener('click',()=>{clipboardPage++;renderClipboard();$('clipboard-list').scrollTop=0;$('clipboard-search').focus();});
$('clear-clipboard').addEventListener('click',()=>{if(confirm('Clear every printing in the Discovery Clipboard? Your imported deck stays unchanged.')){clipboardItems=clearClipboard();persistClipboard();renderClipboard();safeStatus($('copy-status'),'Clipboard cleared. Imported deck unchanged.');$('clipboard-search').focus();}});
$('copy-printings').addEventListener('click',async()=>{
  const text=exportClipboard(clipboardItems);
  try{if(!navigator.clipboard?.writeText)throw new Error('unavailable');await navigator.clipboard.writeText(text);safeStatus($('copy-status'),'Copied with set codes and collector numbers.');}
  catch{$('export-details').open=true;$('clipboard-export').focus();$('clipboard-export').select();safeStatus($('copy-status'),'Automatic copy is unavailable. The export is selected above; press Ctrl+C (or Command+C) to copy it.');}
});
renderClipboard();renderMechanics();
api('/rules-data.json').then(data=>{rulesData=data;renderMechanics();}).catch(()=>{rulesData=null;renderMechanics();});
if(location.hash)followRoute(location.hash);else setStage('import');
try {
  catalog=await api('/api/catalog');renderMechanics();
  const sourceNotes=$('source-notes');sourceNotes.replaceChildren(
    node('p',`MTG Wiki-derived inventory: ${catalog.stats.masterListedEntries} listed entries, not an official Wizards publication as a whole. Eight reviewed keyword abilities are supported; ${catalog.stats.unmappedListedEntries} listed entries are unmapped. Query-only entries: ${catalog.stats.queryOnly}.`),
    node('p',`Atlas v2.0, 2026-10-05: ${catalog.stats.atlasRows} records. 684 Production-ready, 353 Review, 27 Semantic and 22 Do-not-emit. The 623-row historical validity census does not establish current validation of all records. Historical live_count is never used as a result count.`),
    node('p','Wizards rules (2026-09-25) verifies the eight mechanic references. Rosewater 2021 placement describes historic design, not current legality. Scryfall card data supplies exact-printing flavor and current Oracle text, not historical printed rules.'));
  for(const source of catalog.sources)sourceNotes.append(node('p',`${source.path} · SHA-256 ${source.sha256}`,'mono'));
}catch(error){$('source-notes').textContent=error.message;safeStatus($('discovery-status'),`Source catalog blocked: ${error.message}`,true);renderMechanics();}
