import {printingDescription, normalizeCardName, commanderSearchNames} from './import-model.mjs';
import {resolveImport} from './import-resolution.mjs';
import {readImportFile} from './import-limits.mjs';
import {parseDeck, validateCommanderImport, resolveDeck, commanderContext, analyzeFlavor, selectReferencePrinting, identifierKey} from './core.mjs';
import {indexMechanics, keywordKey} from './catalog-gap-index.mjs';
import {mechanicRule, mechanicExplanation, mechanicSourceStatus} from './catalog-gap-references.mjs';
import {DEVOID_SEARCH_REFERENCE} from './mechanic-explanations.mjs';
import {requestOwner} from './request-owner.mjs';
import {importedDiscoveryExclusions} from './discovery-exclusions.mjs';
import {createDemoDeck} from './demo.mjs';
import {addClipboard, setClipboardQuantity, removeClipboard, clearClipboard, exportClipboard, loadClipboard, saveClipboard} from './clipboard.mjs';
import {manaSymbols, identitySymbols, setSymbol, describeSetSymbol, COLOR_NAMES} from './symbols.mjs';
import {cardTrigger, cardVisual, installCardPreviews, closeCardPreview} from './card-preview.mjs';
import {ruleBody, closeRulePreview} from './rules-ui.mjs';
import {clipboardPageView} from './collection-view.mjs';

const $ = id => document.getElementById(id);
const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
const button = (label, action, className) => {const el = node('button', label, className); el.type = 'button'; el.addEventListener('click', action); return el;};
const append = (parent, ...children) => {parent.append(...children.filter(Boolean)); return parent;};
const colors = {W:'White', U:'Blue', B:'Black', R:'Red', G:'Green'};
const knownCards = new Map();
function cardHeading(card, fallback, synthetic = false, reference) {
  return append(node('h3'), card ? cardTrigger(card,{label:fallback || card.name,synthetic,reference}) : document.createTextNode(fallback || 'Unrecognized input'));
}
function printingMeta(card, fallback = {}) {
  const meta=node('div',undefined,'printing-label');
  if(card&&describeSetSymbol(card).supported)meta.append(setSymbol(card));
  meta.append(document.createTextNode(`${(card?.set||fallback.set||'SET UNKNOWN').toUpperCase()} / ${card?.collector_number||fallback.collectorNumber||'PRINTING UNKNOWN'} · ${card?.lang||fallback.language||'language unspecified'}${fallback.section?` · ${fallback.section}`:''}`));
  if(fallback.printingProvenance)meta.append(node('span',printingDescription(fallback.printingProvenance),'printing-provenance'));
  if(fallback.finish&&fallback.finish!=='unspecified')meta.append(node('span',`Requested finish: ${fallback.finish}`,'printing-provenance'));
  if(card&&fallback.name&&fallback.name!==card.name)meta.append(node('span',`Imported as ${fallback.name} · Oracle name: ${card.name}`,'printing-provenance'));
  return meta;
}
function externalLink(text, url) {
  const el = node('a', text);
  // These two retained primary references are outside the usual source hosts.
  const reviewedReferences=['https://www.youtube.com/watch?v=NuWq8-rnJ38&t=617s','https://web.archive.org/web/20201021225115/https://magic.wizards.com/en/articles/archive/latest-developments/building-hydra-2013-10-25'];
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || (!['scryfall.com','magic.wizards.com','media.wizards.com','gatherer.wizards.com'].includes(parsed.hostname)&&!reviewedReferences.includes(parsed.href))) return node('span',text); el.href = parsed.href; }
  catch {return node('span',text);}
  el.target='_blank'; el.rel='noreferrer'; return el;
}
function safeStatus(el, message, error = false) {el.textContent = message; el.classList.toggle('error',error);}
let importedDeck = null, selectedCommanderRows, identity = null, analysis = null, selectedObservation = null;
let contextToken = null, catalog = null, selectedMechanicId = null, discoveries = null, importBusy = false, searchBusy = false, contextGeneration = 0;
let rulesData = null, clipboardPage = 1;
let mechanicIndex=indexMechanics(null),navigationRevision=0;
const importOwner=requestOwner(),discoveryOwner=requestOwner();
function invalidateDiscovery(){discoveryOwner.invalidate();searchBusy=false;discoveries=null;$('discovery-results').setAttribute('aria-busy','false');}
function selectMechanic(key){invalidateDiscovery();selectedMechanicId=key;renderMechanics();renderDiscoveries();}
function commitDeck(deck,token){
  const nextIndex=indexMechanics(deck);
  importedDeck=deck;mechanicIndex=nextIndex;contextToken=token;
  selectedCommanderRows=undefined;selectedMechanicId=null;selectedObservation=null;
  $('commander-search').value='';invalidateDiscovery();renderDeck();
}
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
  navigationRevision++;
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
const narrowMechanics=window.matchMedia('(max-width:760px)');
const sizeMechanicPicker=()=>{$('mechanic-picker').open=!narrowMechanics.matches;};
sizeMechanicPicker();narrowMechanics.addEventListener('change',sizeMechanicPicker);
function browseDeckMechanics(){
  $('mechanic-picker').open=true;
  $('mechanic-picker').scrollIntoView({block:'start'});
  $('mechanic-picker-summary').focus({preventScroll:true});
}
function chooseDeckMechanic(key){
  selectMechanic(key);
  if(narrowMechanics.matches)$('mechanic-picker').open=false;
  $('mechanic-context').scrollIntoView({block:'start'});
  $('mechanic-context').querySelector('h2')?.focus({preventScroll:true});
}
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
    for(const row of importedDeck?.rows.filter(row=>identity.rowIds.includes(row.id))||[])content.append(cardHeading(row.card,row.card.name,importedDeck.synthetic,row));
    openDialog($('evidence-dialog'));
  });
}
$('identity-tip').addEventListener('pointerenter',()=>clearTimeout(identityTipTimer));$('identity-tip').addEventListener('pointerleave',hideIdentityTip);
document.addEventListener('scroll',hideIdentityTip,true);
function showImportProblems(rows){
  const list=$('import-diagnostics-list');list.replaceChildren();
  for(const row of rows)list.append(append(node('article',undefined,'import-problem'),node('p',`Line ${row.lineNumber} · ${row.section}: ${row.issues.join(' ')}`),node('pre',row.originalLine)));
  $('import-diagnostics').hidden=!rows.length;
}
$('import-button').addEventListener('click',()=>importText());
let pendingImportDraft=null;
const fileOwner=requestOwner();
function releasePendingImport() {
  importOwner.invalidate();contextGeneration++;importBusy=false;
  $('commander-apply').disabled=false;$('import-button').textContent='Import deck →';renderMechanics();
}
function draftChanged() {
  fileOwner.invalidate();releasePendingImport();pendingImportDraft=null;
  $('import-placement').hidden=true;$('import-diagnostics').hidden=true;
  safeStatus($('import-message'),'Draft changed. Click Import when ready; your loaded deck is unchanged.');
}
function previewDraft() {
  try {
    const parsed=parseDeck($('deck-input').value);
    const errors=parsed.issues.length+parsed.rows.filter(row=>row.parseIssues.length).length;
    const commanders=parsed.rows.filter(row=>row.section==='Commander').length;
    safeStatus($('import-preview'),`${parsed.schema} · ${parsed.rows.length} entries · ${parsed.counts.playableQuantity}/100 deck cards · ${parsed.counts.excludedQuantity} extras · ${commanders} designated commanders.${errors?` ${errors} input issues to review.`:''} Nothing sent until Import.`,errors>0);
  } catch(error) { safeStatus($('import-preview'),error.message,true); }
}
async function chooseImportFiles(files) {
  draftChanged();
  const ticket=fileOwner.begin({});
  try {
    if(files.length!==1)throw new Error('Choose or drop one .txt or .csv file at a time.');
    const text=await readImportFile(files[0]);
    if(!fileOwner.owns(ticket))return;
    $('deck-input').value=text;previewDraft();
    safeStatus($('import-message'),`Loaded ${files[0].name} locally. Review the preview, then click Import.`);
    $('deck-input').focus();
  } catch(error) { if(fileOwner.owns(ticket))safeStatus($('import-message'),error.message,true); }
}
$('deck-file').addEventListener('click',()=>{draftChanged();$('deck-file').value='';});
$('deck-file').addEventListener('change',()=>chooseImportFiles([...$('deck-file').files]));
$('import-drop').addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';});
$('import-drop').addEventListener('drop',event=>{event.preventDefault();return chooseImportFiles([...event.dataTransfer.files]);});
async function importText(commanderRowIds=[]){
  fileOwner.invalidate();releasePendingImport();
  let parsed;
  try {
    parsed=parseDeck($('deck-input').value,{commanderRowIds});
    pendingImportDraft=null;$('import-placement').hidden=true;$('import-diagnostics').hidden=true;
    if(parsed.commanderSuggestions.length){
      pendingImportDraft={text:parsed.sourceText,rowId:parsed.commanderSuggestions[0].rowId};
      $('import-placement').hidden=false;
      $('import-placement-message').textContent=`Line ${parsed.commanderSuggestions[0].lineNumber}: ${parsed.commanderSuggestions[0].name} is in an unlabeled final block after Sideboard. Confirm whether it is your commander. Deck: ${parsed.counts.playableQuantity} cards; extras: ${parsed.counts.excludedQuantity}.`;
      safeStatus($('import-message'),'Commander placement needs confirmation. Your loaded deck has not changed.',true);return;
    }
    if(!parsed.rows.length)throw new Error('Paste a deck export before importing.');
    const validation=validateCommanderImport(parsed);
    if(!validation.valid){showImportProblems(parsed.rows.filter(row=>row.parseIssues.length));throw new Error(`Import blocked. ${validation.issues.join('\n')}`);}
  }
  catch(error){
    const alreadyShown=$('import-preview').textContent===error.message;
    safeStatus($('import-message'),alreadyShown?'':error.message,!alreadyShown);return;
  }
  const ticket=importOwner.begin({deckRevision:++contextGeneration}),route=navigationRevision;
  importBusy=true;$('commander-apply').disabled=true;
  $('import-button').textContent='Replace pending import →'; safeStatus($('import-message'),`Resolving ${parsed.identifiers.length} distinct card or printing identifiers through Scryfall… The previous deck remains visible until this import finishes.`);
  invalidateDiscovery();renderMechanics();renderDiscoveries();
  try {
    const result = await resolveImport(parsed,api,()=>importOwner.owns(ticket));
    if(!result||!importOwner.owns(ticket))return;
    const candidate=result.deck;
    const construction=validateCommanderImport(candidate);
    if(!construction.valid){safeStatus($('import-message'),`Import blocked. ${construction.issues.join('\n')} Your loaded deck has not changed.`,true);return;}
    const blocked=candidate.rows.filter(row=>row.playable&&row.status!=='resolved');
    if(blocked.length){showImportProblems(blocked);safeStatus($('import-message'),`Import incomplete: ${blocked.length} deck entries could not be matched. Your loaded deck has not changed.\n${blocked.slice(0,5).map(row=>`Line ${row.lineNumber}: ${row.issues.join(' ')}`).join('\n')}${blocked.length>5?'\nOpen Inspect import problems for every unmatched line.':''}`,true);return;}
    commitDeck(candidate,result.contextToken);
    const attention=importedDeck.rows.filter(row=>row.status!=='resolved'||row.issues.length);
    const commander=importedDeck.rows.filter(row=>row.section==='Commander'&&row.status==='resolved').map(row=>row.card.name).join(', ');
    const provenance=` ${importedDeck.counts.assumedEntries} deck entries use assumed printings; ${importedDeck.counts.suppliedEntries} use supplied editions; ${importedDeck.counts.chosenEntries} use user-selected editions. ${commander?`Commander: ${commander}.`:'Choose your commander below.'}`;
    const problems=attention.slice(0,5).map(row=>`Line ${row.lineNumber} (${row.section}): ${row.issues.join(' ')}`);
    safeStatus($('import-message'),`${attention.length?'Import needs attention.':'Import complete.'} Deck + Commander: ${importedDeck.counts.playableQuantity}/100 cards. Extras: ${importedDeck.counts.excludedQuantity} ${importedDeck.counts.excludedQuantity===1?'card':'cards'} in ${importedDeck.counts.excludedEntries} ${importedDeck.counts.excludedEntries===1?'entry':'entries'}. ${importedDeck.counts.resolvedEntries} deck entries resolved; ${attention.length} imported entries need attention.${problems.length?`\n${problems.join('\n')}`:''}${attention.length>5?`\nSee the import ledger for ${attention.length-5} more entries.`:''}${provenance}${result.warnings?.length ? ` ${result.warnings.join(' ')}` : ''}`,attention.length>0);
    if(!attention.length&&commander&&importedDeck.counts.resolvedEntries&&route===navigationRevision){$('import-workbench').open=false;$('archive-tab').focus();}
  } catch(error) {
    if(!importOwner.owns(ticket))return;
    safeStatus($('import-message'),`${error.message} Your loaded deck has not changed.`,true);
  } finally {if(importOwner.owns(ticket)){importBusy=false;$('commander-apply').disabled=false;$('import-button').textContent='Import deck →';renderMechanics();}}
}
$('confirm-import-commander').addEventListener('click',()=>{
  if(!pendingImportDraft)return;
  if(pendingImportDraft.text!==$('deck-input').value){pendingImportDraft=null;$('import-placement').hidden=true;safeStatus($('import-message'),'The draft changed. Import again to review its placement.',true);return;}
  return importText([pendingImportDraft.rowId]);
});
$('deck-input').addEventListener('input',()=>{draftChanged();previewDraft();});
$('demo-button').addEventListener('click',()=>{
  fileOwner.invalidate();
  importOwner.invalidate();contextGeneration++;importBusy=false;$('commander-apply').disabled=false;$('import-button').textContent='Import deck →';
  pendingImportDraft=null;$('import-placement').hidden=true;commitDeck(createDemoDeck(),null);$('import-workbench').open=false;safeStatus($('import-message'),'Synthetic fixture loaded. No Scryfall requests were made.');$('archive-tab').focus();
});
$('clear-deck-input').addEventListener('click',()=>{
  if(importBusy)return;
  fileOwner.invalidate();pendingImportDraft=null;$('import-placement').hidden=true;$('deck-input').value='';$('import-preview').textContent='';
  safeStatus($('import-message'),'Pasted text cleared. Your loaded deck and Clipboard are unchanged.');
  $('deck-input').focus();
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
  for(const row of commanders){const item=node('div',undefined,'selected-commander');const copy=append(node('div',undefined,'commander-copy'),node('h3',row.card.name),printingMeta(row.card,row),node('p','Select the card to inspect its rules and printing.','fine'));append(item,cardVisual(row.card,{className:'commander-visual',synthetic:importedDeck.synthetic,reference:row}),copy);current.append(item);}
  if(!commanders.length)current.append(node('p','Choose one or two resolved imported cards to establish a discovery boundary.','fine'));
  $('commander-picker').open ||= !commanders.length;
  const options=$('commander-options');options.replaceChildren();
  for(const row of importedDeck.rows.filter(row=>row.playable&&row.status==='resolved')) {
    const option=node('div',undefined,'commander-option');option.dataset.names=JSON.stringify(commanderSearchNames(row));
    const label=node('label'),input=node('input');input.type='checkbox';input.value=row.id;input.checked=identity.rowIds.includes(row.id);input.setAttribute('aria-label',`Select ${row.card.name} (${row.card.set.toUpperCase()}) ${row.card.collector_number} as commander`);
    append(label,input,document.createTextNode(row.card.name));append(option,label,printingMeta(row.card,row),cardTrigger(row.card,{label:'Inspect',className:'commander-inspect',synthetic:importedDeck.synthetic,reference:row}));options.append(option);
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
  if(importBusy)return;
  const selected=[...$('commander-options').querySelectorAll('input:checked')].map(el=>el.value);
  const rows=importedDeck.rows.filter(row=>selected.includes(row.id));
  if(rows.length!==selected.length||rows.some(row=>row.status!=='resolved'||!row.card)){safeStatus($('commander-option-status'),'Select resolved cards from the current import.',true);return;}
  if(rows.length<1||rows.length>2){safeStatus($('commander-option-status'),'Select one or two commander cards.',true);return;}
  const identities=rows.map(row=>row.card.oracle_id||row.card.name);
  if(new Set(identities).size!==identities.length){safeStatus($('commander-option-status'),'These entries are the same card identity. Select one entry for that commander.',true);return;}
  contextGeneration++;selectedCommanderRows=selected;invalidateDiscovery();renderDeck();
  $('commander-picker').open=false;($('commander-current').querySelector('button')||$('commander-picker').querySelector('summary')).focus({preventScroll:true});
});
function filterCommanders(){const query=normalizeCardName($('commander-search').value);let shown=0;for(const option of $('commander-options').children){option.hidden=!JSON.parse(option.dataset.names).some(name=>name.includes(query));if(!option.hidden)shown++;}$('commander-option-status').textContent=`${shown} resolved cards shown. Selection is retained when filtering.`;}
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
    const heading=append(node('div',undefined,'entry-header'),append(node('div'),cardHeading(row.card,row.name,importedDeck.synthetic,row),printingMeta(row.card,row)));
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
    if(hasFlavor)details.append(node('p',importedDeck.synthetic?'Authored sample passage.':printingDescription(row.printingProvenance)+'. Flavor text belongs to the displayed edition.','fine'));
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
  if(card)article.append(cardVisual(card,{synthetic:importedDeck.synthetic,compact:true,reference:row}));
  append(copy,cardHeading(card,passage.name,importedDeck.synthetic,row),printingMeta(card,{set:passage.set,collectorNumber:passage.collectorNumber,language:passage.language,printingProvenance:passage.printingProvenance}));
  if(passage.faceIndex!==null)copy.append(node('p',`From ${passage.faceName}`,'face-label'));
  const quote=node('blockquote');quote.append(highlight(passage.text,spans));copy.append(quote);
  copy.append(node('p',`${row?.quantity||1} ${row?.quantity===1?'copy':'copies'} in your imported deck${spans.length?` · ${spans.length} ${spans.length===1?'match':'matches'} in this passage`:''}.`,'fine'));
  const details=append(node('details',undefined,'technical-details'),node('summary','About this printing'));
  append(details,node('p',importedDeck.synthetic?'Authored demonstration passage.':printingDescription(row.printingProvenance)+'. Flavor text belongs to the displayed edition; rules use current Oracle text.'),node('p',`Printing identifier: ${passage.printingId}`,'mono'));
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
  list.append(node('p',`Deck + Commander: ${importedDeck.counts.playableQuantity}/100 cards in ${importedDeck.counts.playableEntries} entries. Extras: ${importedDeck.counts.excludedQuantity} cards in ${importedDeck.counts.excludedEntries} entries, excluded from analysis. ${importedDeck.counts.resolvedEntries} resolved, ${importedDeck.counts.unresolvedEntries} unresolved (including ${importedDeck.counts.ambiguousEntries} ambiguous); ${importedDeck.counts.flavorAbsentEntries} resolved entries without flavor.`,'fine'));
  list.append(node('p',`${identity.label}. ${identity.issues.join(' ')}`,'fine'));
  for(const row of importedDeck.rows){const article=node('article',undefined,'ledger-row');append(article,node('h3',`${row.lineNumber}. ${row.name || 'Invalid line'}`),node('p',`${row.section} · quantity ${row.quantity} · ${row.status}${row.playable?'':' · EXCLUDED from analysis'}${identity.rowIds.includes(row.id)?' · SELECTED COMMANDER':''}`,'micro'),node('pre',row.originalLine),node('p',rowFlags(row).join(' ')));if(row.card)article.append(node('p',`Returned: ${row.card.name} · ${row.card.set.toUpperCase()} ${row.card.collector_number} · ${row.card.lang} · ${row.card.id}`,'mono'));if(row.returnedPrinting)article.append(node('pre',`Mismatch record: ${JSON.stringify(row.returnedPrinting)}`));if(!importedDeck.synthetic&&['assumed','user-selected'].includes(row.printingProvenance?.kind)){
      const change=node('details'),summary=node('summary','Change reference printing');change.append(summary);
      const label=node('label','Scryfall printing UUID'),input=node('input');input.type='text';input.id=`printing-${row.id}`;label.htmlFor=input.id;input.placeholder='Paste an exact printing UUID';
      const status=node('p','','status');status.setAttribute('role','status');
      const apply=button('Use this printing',()=>changeReferencePrinting(row.id,input.value.trim(),status,apply),'text-button');
      change.append(label,input,apply,status,node('p','Your original source stays unchanged. Supplied editions must be corrected in the pasted list.','fine'));article.append(change);
    }article.append(node('p',row.card?printingDescription(row.printingProvenance):'Printing unresolved','fine'));if(row.finish!=='unspecified')article.append(node('p',`Requested finish: ${row.finish}`,'fine'));list.append(article);}
}
async function changeReferencePrinting(rowId,printingId,status,apply){
  const before=importedDeck;
  try{
    printingId=printingId.toLowerCase();
    if(importBusy)throw new Error('Wait for the pending import to finish.');
    const draft=selectReferencePrinting(before,rowId,printingId);
    const revision=++contextGeneration;
    apply.disabled=true;safeStatus(status,'Checking the selected printing…');
    // Pin every other row to its existing edition so one correction cannot
    // silently change unrelated reference printings or their flavor passages.
    const identifiers=[...new Map(draft.rows.filter(row=>row.card||row.id===rowId).map(row=>{const id=row.id===rowId?printingId:row.card.id;return [id,{id}];})).values()];
    const result=await api('/api/resolve',{identifiers});
    if(importedDeck!==before||importBusy||revision!==contextGeneration){safeStatus(status,'The deck changed. Review the current import before choosing a printing.',true);return;}
    const outcomes=draft.rows.filter(row=>row.identifier).map(row=>{const cardId=row.id===rowId?printingId:before.rows.find(item=>item.id===row.id).card?.id;return {lookupKey:identifierKey(row.identifier),status:result.cards.some(card=>card.id===cardId)?'matched':'not-found',cardId,setHint:before.rows.find(item=>item.id===row.id)?.printingProvenance?.setHint || null};});
    const candidate=resolveDeck(draft,result.cards,[],outcomes);
    if(candidate.rows.find(row=>row.id===rowId).status!=='resolved')throw new Error(candidate.rows.find(row=>row.id===rowId).issues.join(' '));
    if(candidate.rows.some(row=>row.playable&&row.status!=='resolved'))throw new Error('Other deck entries could not be verified. Your selected edition was not applied.');
    const commanderRows=selectedCommanderRows;
    commitDeck(candidate,result.contextToken);selectedCommanderRows=commanderRows;renderDeck();renderLedger();
    safeStatus($('import-message'),'Reference printing updated. The original imported text is preserved; flavor analysis has been recomputed.');
  }catch(error){safeStatus(status,error.message,true);}finally{apply.disabled=false;}
}

function renderMechanics() {
  $('clear-deck-input').disabled=importBusy;
  const focusKey=document.activeElement?.dataset.mechanicFocus;
  const restoreFocus=()=>{if(!focusKey)return;const target=[...document.querySelectorAll('[data-mechanic-focus]')].find(el=>el.dataset.mechanicFocus===focusKey&&!el.disabled)||$('mechanic-context').querySelector('h2');target?.focus({preventScroll:true});};
  const detected=$('detected-list');detected.replaceChildren();
  const found=mechanicIndex.terms,c=mechanicIndex.coverage;
  if(importedDeck){
    detected.append(node('p',`${found.length} ${found.some(t=>t.hasOracleEvidence)?'mechanic labels and Oracle-text matches':`card labels reported by ${importedDeck.synthetic?'the demo':'Scryfall'}`} · ${c.copies} cards in your imported main deck.`, 'mechanics-summary'));
    detected.append(node('p',`${c.reportedEntries} of ${c.entries} imported entries have usable label data (${c.reportedCopies} of ${c.copies} copies). ${c.entries-c.resolvedEntries} unresolved entries. This list may not include every mechanic.`, 'fine'));
    detected.append(node('p',importedDeck.synthetic?'These sample cards and labels come from the demo.':'Your import determines which cards appear here. Matches use Scryfall labels and reviewed Oracle wording. Open a mechanic to inspect its source.','fine'));
    const coverage=append(node('details',undefined,'technical-details'),node('summary','Import record details'));
    coverage.append(node('p',`${c.resolvedEntries} resolved entries; ${c.missingEntries} missing and ${c.malformedEntries} malformed keyword arrays; ${c.emptyEntries} empty arrays. Empty or unreported labels do not mean a card has no mechanics. Distinct cards are counted by Oracle identity; copies count imported quantities.${c.missingOracleEntries?` ${c.missingOracleEntries} entries lack Oracle IDs and are counted by printing instead.`:''}`, 'fine'));
    detected.append(coverage);
  }
  if(!found.length)detected.append(node('p',importedDeck?'No labels are available for the resolved cards.':'Import a deck to explore its mechanics.','fine'));
  else {const browse=button('Browse this deck’s mechanics →',browseDeckMechanics,'text-button');browse.dataset.mechanicFocus='browse-deck';detected.append(browse);}
  const choices=$('mechanic-list');choices.replaceChildren();
  $('mechanic-picker-summary').textContent=found.find(term=>term.key===selectedMechanicId)?.label||`Choose a mechanic (${found.length})`;
  for(const term of found){const el=button(`${term.label} · ${term.distinctCards}`,()=>chooseDeckMechanic(term.key),'mechanic-choice');el.dataset.mechanicFocus=`deck-${term.key}`;el.setAttribute('aria-pressed',String(selectedMechanicId===term.key));choices.append(el);}
  if(!found.length)choices.append(node('p','No deck labels to browse yet.','fine'));
  const item=found.find(r=>r.key===selectedMechanicId);
  const record=item?catalog?.records.find(r=>keywordKey(r.master_name)===item.key):null;
  const context=$('mechanic-context');context.replaceChildren();
  if(!item){context.append(node('h2','Choose a mechanic'),node('p','Choose from this deck’s list to read the source and see the matching cards.','fine'));restoreFocus();return;}
  const explanation=mechanicExplanation(rulesData,item.label,item.cards.map(card=>card.oracleId));
  const sourceStatus=mechanicSourceStatus(item.label);
  const unverified=['unverified','provider-card-example'].includes(sourceStatus);
  append(context,node('span',sourceStatus==='playtest-card-example'?'Playtest ability word · card reference':unverified?'Card label · official source unverified':item.reviewed?item.category:'Additional card label','eyebrow'),node('h2',item?.label||record.master_name));
  if(unverified)context.append(node('p','Official source not verified for this label. Any linked reference is general background. Open a contributing card to read its text.','fine mechanic-source-status'));
  if(explanation?.playtest){const p=explanation.playtest;context.append(node('p',`${p.card} · Mystery Booster playtest card · Commander: not legal (Scryfall, ${p.checkedOn}).`,'fine mechanic-source-status'));}
  context.querySelector('h2').tabIndex=-1;context.querySelector('h2').dataset.mechanicFocus='context-title';
  const ruleNumber=mechanicRule(rulesData,item.label);
  if(ruleNumber){const rules=node('details',undefined,'rules-card');
    append(rules,node('summary','Read rules · '+item.label),ruleBody(rulesData,ruleNumber,{onOpen:showRule}),externalLink('Official Magic rules ↗','https://magic.wizards.com/en/rules'));context.append(rules);
  }else if(explanation){
    const rules=node('details',undefined,'rules-card');
    const scopedLabels={'designer-card-example':' · Designer card example','archived-mechanic-discussion':' · Archived Wizards discussion','official-card-example':' · Official card example','playtest-card-example':' · Playtest card reference'};
    const referenceLabel=scopedLabels[explanation.referenceKind]??(explanation.referenceKind==='official-mechanic-reference'?' · Wizards reference':explanation.referenceKind==='provider-card-example'?' · Scryfall card example':explanation.referenceKind==='ability-word'?' · General ability-word rule':explanation.referenceKind==='card-example'?' · Official card reference':explanation.generalReference?' · General flavor-word rule':' · Read rules');
    rules.append(node('summary',explanation.title+referenceLabel));
    if(explanation.referenceKind==='provider-card-example')rules.append(node('p','Card example from Scryfall. A general Wizards rules definition has not been verified here. Read each contributing card’s own text below.','fine'));
    if(explanation.definitionVerified===false&&!explanation.playtest)rules.append(node('p','General rules definition not supplied. Read each card’s own text below.','fine'));
    if(explanation.cardOracleIds)rules.append(node('p',`This reference applies only to ${explanation.source.section}.`,'fine'));
    if(explanation.quote)rules.append(append(node('blockquote',undefined,'official-excerpt'),manaSymbols(explanation.quote)));
    if(explanation.source){
      const sourceLabel=explanation.quote?'excerpt':explanation.source.kind==='article'?'mechanic reference':explanation.source.kind==='card-example'?'card example':'card reference';
      const label=explanation.playtest?`${explanation.source.section} on Scryfall ↗`:`${explanation.source.publisher??(explanation.referenceKind==='provider-card-example'?'Scryfall':'Wizards')} ${sourceLabel} · ${explanation.source.title} · ${explanation.source.section} ↗`;
      const link=externalLink(label,explanation.source.url);
      rules.append(explanation.playtest?append(node('p',undefined,'fine'),link):link);
    }
    if(explanation.supportingSource){const s=explanation.supportingSource;rules.append(append(node('p',undefined,'fine'),externalLink(explanation.playtest?'Wizards playtest rules ↗':`${s.publisher} playtest format guidance · ${s.title} · ${s.section} ↗`,s.url)));}
    for(const number of explanation.rules)rules.append(ruleBody(rulesData,number,{onOpen:showRule,clauseOnly:true}));
    if(explanation.rules.length)rules.append(externalLink('Official Magic rules ↗','https://magic.wizards.com/en/rules'));
    context.append(rules);
  }else context.append(node('p','No linked explanation is available in this rules reference. Open a card below to read its rules.','fine'));
  const deckCards=node('section',undefined,'mechanic-deck-cards');
  deckCards.append(node('h3',item?`${item.label} · ${item.distinctCards} distinct ${item.distinctCards===1?'card':'cards'} · ${item.copies} ${item.copies===1?'copy':'copies'}`:'This label is not reported on your imported cards'));
  if(item){
    deckCards.append(node('p',importedDeck.synthetic?'Demo labels · invented sample cards':item.hasOracleEvidence?'Oracle wording · Scryfall card data':'Reported by Scryfall','source-chip'));
    deckCards.append(node('p',importedDeck.synthetic?'These sample cards carry this label in the demo.':item.hasOracleEvidence?'These cards match reviewed Oracle wording, including reminder text and symbols. Matches can be grants, restrictions, or references; they do not prove possession or a usable action. Source record details show the exact matches.':'These cards are in your imported deck, and Scryfall lists this label for them. Open a card to read its rules; the label alone does not explain what the card does or which face uses it.','fine'));
    if(!item.reviewed)deckCards.append(node('p','Additional Scryfall label · not yet matched to our reviewed list.','fine'));
    const source=append(node('details',undefined,'technical-details'),node('summary','Source record details'));
    source.append(node('p',item.hasOracleEvidence?`Relationship: ${item.relationship}. Oracle matches retain their source field, offset, and face index. Recognition covers explicit reviewed wording only; implicit actions and other wording may be absent.`:`Source field: keywords[]. Relationship: provider_reports. No possession, grant, reference, parameter or face attribution is inferred. ${item.audited?`Exact label observed in the ${mechanicIndex.vocabularyVersion} audit; this verifies vocabulary, not complete rules detection.`:item.reviewed?`Exact label reviewed in the ${item.classification.review==='catalog-gaps-2026-10-19'?'Scryfall catalog':item.classification.review==='mechanic-variants-2026-10-18'?'mechanic variants':'Commander shortlist'} supplement; not part of the historical vocabulary audit.`:'Unmapped term; not certified by the pinned vocabulary.'}`,'fine'));
    if(item.classification?.category==='other provider-reported term')source.append(node('p',`Classification retained without harmonizing: source ${item.classification.sourceCategories.join(', ')||'unclassified'}; provider catalog ${item.classification.providerCategories.join(', ')||'unlisted'}.`,'fine'));
    const grid=node('div',undefined,'deck-card-grid');
    const printingRows=new Map();
    for(const member of item.cards)for(const row of member.rows){if(!printingRows.has(row.printingId))printingRows.set(row.printingId,[]);printingRows.get(row.printingId).push(row);}
    for(const [id,rows] of printingRows){
      const card=knownCards.get(id);if(!card)continue;
      const reference=importedDeck.rows.find(row=>row.id===rows[0].rowId);
      const tile=node('article',undefined,'visual-card');append(tile,cardVisual(card,{synthetic:importedDeck.synthetic,reference}),cardHeading(card,undefined,importedDeck.synthetic,reference),printingMeta(card,reference));
      const provenanceKinds=[...new Set(rows.map(item=>importedDeck.rows.find(row=>row.id===item.rowId)?.printingProvenance?.kind))];
      if(provenanceKinds.length>1)tile.append(node('p','Entries for this edition have different printing provenance; inspect source rows below.','fine'));
      const copies=rows.reduce((n,r)=>n+r.quantity,0);
      tile.append(node('p',`${copies} ${copies===1?'copy':'copies'} in your deck`,'fine'));
      tile.append(node('p',`Imported lines: ${rows.map(r=>r.lineNumber).join(', ')}`,'fine'));
      if(card.scryfall_uri)tile.append(externalLink('Displayed edition on Scryfall ↗',card.scryfall_uri));
      const proof=append(node('section'),node('h4',card.name),printingMeta(card,reference));
      for(const item of rows){const sourceRow=importedDeck.rows.find(row=>row.id===item.rowId);proof.append(node('p',`Line ${item.lineNumber}: ${printingDescription(sourceRow?.printingProvenance)}`,'fine'));}
      for(const row of rows)for(const occurrence of row.occurrences)proof.append(node('p',occurrence.sourceField?`${occurrence.sourceField} at ${occurrence.index} = ${JSON.stringify(occurrence.spelling)}`:`keywords[${occurrence.index}] = ${JSON.stringify(occurrence.spelling)}`,'mono'));
      append(proof,node('p',`Oracle ID: ${card.oracle_id||'unavailable'} · Printing ID: ${id}`,'mono'),node('p',`Import rows: ${rows.map(r=>r.rowId).join(', ')}. ${item.hasOracleEvidence?'Text offsets identify wording, not which abilities currently apply.':'Metadata applies to the whole card; no face attribution.'}`, 'fine'));
      source.append(proof);
      grid.append(tile);
    }
    deckCards.append(grid,source);
  }else deckCards.append(node('p','This optional search looks for other cards. It does not add a mechanic to your deck’s list. Scryfall labels may be incomplete.','fine'));
  if(!record){
    context.append(deckCards,node('p',item.classification?.discovery==='card-specific'?'Open a contributing card to read its text. No discovery search is linked to this label.':catalog?'No validated discovery search is linked to this provider label yet. Its imported cards remain available; new labels require an explicit reviewed mapping.':'External searches and historical color placements are unavailable. You can still inspect your imported cards.','fine'));
    restoreFocus();return;
  }
  const history=append(node('details',undefined,'color-history'),node('summary',`How the colors use ${record.master_name}`));
  if(record.placement){
    history.append(node('p','A historical view of color design. Primary, secondary and tertiary describe how often a color receives an ability, not its strength.','fine'));
    const table=node('table',undefined,'placement-table');const header=node('tr');append(header,node('th','Color'),node('th','2021 placement'),node('th','Commander identity'));table.append(append(node('thead'),header));
    const body=node('tbody');
    for(const [code,name] of Object.entries(colors)){const place=record.placement.colors?.[code];const tier=typeof place==='string'?place:place?.tier;append(body,append(node('tr'),append(node('td'),identitySymbols([code]),document.createTextNode(` ${name}`)),node('td',tier?`${tier[0].toUpperCase()}${tier.slice(1)}`:'No placement'),node('td',identity?.colorIdentity===null||!identity?'Not selected':identity.colorIdentity.includes(code)?'Selected':'—')));}
    table.append(body);history.append(table);
    if(record.placement.explanation)history.append(append(node('p',undefined,'source-explanation'),manaSymbols(record.placement.explanation)));
    history.append(node('p','Based on the 2021 color-pie article. Individual sets may depart from this pattern. Full source information is in the footer.','fine'));
  }
  if(record.placement)context.append(history);
  context.append(deckCards);
  const box=queryBox(record,buildVisibleQuery(record));context.append(box);
  const run=button(searchBusy?'Searching Scryfall…':`Search ${record.master_name} cards →`,()=>runDiscovery(record),'primary');
  run.dataset.mechanicFocus='run-discovery';
  run.disabled=importBusy||searchBusy||!contextToken||!identity?.colorIdentity||identity.rowIds.length>2||importedDeck?.synthetic;context.append(run);
  if(run.disabled&&!searchBusy)context.append(node('p',importedDeck?.synthetic?'Live discovery is unavailable in synthetic fixture mode. Import a real deck to use a server-validated commander identity.':'Import a real deck and select one or two resolved commanders to search.','fine'));
  restoreFocus();
}
function showRule(number){
  const dialog=$('evidence-dialog'),wasOpen=dialog.open,section=rulesData?.sections?.[number];
  $('evidence-title').textContent=`${number}. ${section?.title||'Official rule'}`;
  $('evidence-content').replaceChildren(ruleBody(rulesData,number,{onOpen:showRule}),node('p','Official Comprehensive Rules · September 25, 2026.','fine'));
  if(!wasOpen)openDialog(dialog);else{closeRulePreview();dialog.querySelector('.close-dialog').focus();}
}
function buildVisibleQuery(record) {if(!identity?.colorIdentity)return 'Choose a commander to search.';return `(f:commander id<=${identity.colorIdentity.join('').toLowerCase()||'c'}) (${record.discovery.expression})`;}
function discoveryIdentity(label,codes) {
  const chip=append(node('span',undefined,'discovery-identity'),node('span',label,'discovery-identity-label'));
  if(Array.isArray(codes)&&codes.every(c=>['W','U','B','R','G'].includes(c)))chip.append(identitySymbols(codes),node('span',codes.length?codes.map(c=>COLOR_NAMES[c]).join(', '):'Colorless'));
  else chip.append(node('span','Unknown'));
  return chip;
}
function queryBox(record,query) {
  const box=node('div',undefined,'query-box');append(box,node('h3',`Find ${record.master_name} cards`));
  const description=node('p','Commander-legal cards within your commander’s colors ');if(identity?.colorIdentity)description.append(identitySymbols(identity.colorIdentity));box.append(description);
  const details=append(node('details'),node('summary',record.atlas.tier==='Review'?'How this search works · Review coverage':'How this search works'));
  append(details,append(node('p'),manaSymbols(record.discovery.coverage)),node('p','Fewer-color and colorless cards are included. Browse 24 distinct cards per page, using a recent printing of each. Saving a card keeps that edition in your separate Clipboard. Use the page controls to explore every match.'),node('code',query));box.append(details);
  return box;
}
async function runDiscovery(record,page=1,continuation=false) {
  if(importBusy||!contextToken||!identity?.colorIdentity)return;
  const previous=continuation?discoveries:null,pageCache=previous?.pageCache||new Map();
  const commanderIds=[...new Set(importedDeck.rows.filter(r=>identity.rowIds.includes(r.id)).map(r=>r.card.id))];
  const ticket=discoveryOwner.begin({deckRevision:contextGeneration,commanders:commanderIds.join(','),mechanic:selectedMechanicId,query:record.atlas_row_id,page}),route=navigationRevision;
  searchBusy=true;renderMechanics();renderDiscoveryPagination();$('discovery-results').setAttribute('aria-busy','true');
  safeStatus($('discovery-status'),`Loading ${record.master_name} cards${continuation?` · page ${page}`:''}…`);
  let succeeded=false;
  try {
    const result=pageCache.get(page)||await api('/api/discover',{atlasRowId:record.atlas_row_id,contextToken,commanderIds,page});
    if(!discoveryOwner.owns(ticket))return;
    pageCache.set(page,result);discoveries={...result,record,pageCache};renderDiscoveries();succeeded=true;
  }catch(error){if(discoveryOwner.owns(ticket)){discoveries=previous;renderDiscoveries();safeStatus($('discovery-status'),`${error.message}${previous?' Your previous page is still here.':''}`,true);}}
  finally{
    if(discoveryOwner.owns(ticket)){
      searchBusy=false;$('discovery-results').setAttribute('aria-busy','false');renderMechanics();renderDiscoveryPagination();
      if(succeeded&&route===navigationRevision){navigate('#discovery');if(continuation){$('discovery-pages-top').scrollIntoView({block:'start',behavior:'instant'});$('discovery-page-top')?.focus({preventScroll:true});}}
    }
  }
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
  $('discovery-intro').hidden=discoveries?.totalCards===0;
  renderDiscoveryPagination();
  if(!discoveries){if(!searchBusy)safeStatus($('discovery-status'),'No discovery search has been run for this commander context.');return;}
  safeStatus($('discovery-status'),discoveries.totalCards===0?'':discoverySummary());
  const searchDetails=append(node('div',undefined,'discovery-search-details'),
    append(node('details'),node('summary','View exact query'),node('code',discoveries.providerQuery||discoveries.query)));
  if(discoveries.scryfallUrl)searchDetails.append(externalLink('Open on Scryfall ↗',discoveries.scryfallUrl));
  if(!discoveries.cards.length){
    // Completed results carry the server-resolved identity. Missing identity is
    // not evidence of colorlessness, and skipped cards are not a zero count.
    const colorlessDevoid=discoveries.record.atlas_row_id==='keyword-index-devoid'&&discoveries.totalCards===0&&Array.isArray(discoveries.identity)&&discoveries.identity.length===0;
    const heading=node('h3',discoveries.totalCards===0?`No compatible ${discoveries.record.master_name} cards found`:'No cards to show on this page');
    const explanation=node('p',undefined,'discovery-empty-explanation');
    if(colorlessDevoid){
      for(const excerpt of DEVOID_SEARCH_REFERENCE.excerpts)explanation.append(node('strong',`CR ${excerpt.number} `),manaSymbols(excerpt.text),' ');
      explanation.append(externalLink('Official Magic rules ↗','https://magic.wizards.com/en/rules'));
    }
    else explanation.textContent=discoveries.totalCards===0?'No Commander-legal cards matched this identity.':'These results could not be shown safely. Try another page or inspect them on Scryfall.';
    const empty=append(node('div',undefined,'empty-message discovery-empty'),
      discoveryIdentity('Commander identity',discoveries.identity),heading,explanation);
    const exclusions=discoveries.totalCards===0?importedDiscoveryExclusions(importedDeck,discoveries.record.discovery.key,discoveries.identity):[];
    if(exclusions.length){
      const details=append(node('details',undefined,'discovery-exclusions'),node('summary',`Why imported cards are excluded (${exclusions.length})`));
      const list=node('ul');
      for(const {card,notLegal,outsideIdentity} of exclusions){
        const title=append(node('div',undefined,'discovery-exclusion-title'),node('strong',card.name));
        if(notLegal)title.append(node('span','Not Commander-legal','discovery-exclusion-reason'));
        const item=append(node('li'),title);
        if(outsideIdentity)item.append(append(node('div',undefined,'discovery-identity-comparison'),
          discoveryIdentity('Card identity',card.color_identity),discoveryIdentity('Commander identity',discoveries.identity)),
          node('span','Outside commander colors','discovery-exclusion-reason'));
        list.append(item);
      }
      details.append(list);empty.append(details);
    }
    empty.append(searchDetails);
    empty.setAttribute('role','status');results.append(empty);
  }else query.append(searchDetails);
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
    node('p',`MTG Wiki-derived inventory: ${catalog.stats.masterListedEntries} listed entries, not an official Wizards publication as a whole. The discovery registry supports ${catalog.stats.supported} reviewed provider labels, including ${catalog.stats.supplementalRows} searches added from the Commander shortlist. Eight crosswalks retain reviewed historical color placements. Unfamiliar labels remain visible and need an explicit validated search mapping.`),
    node('p',`Atlas v${catalog.atlasVersion}: ${catalog.stats.atlasRows} records plus ${catalog.stats.supplementalRows} supplemental recipes. Discovery recipes have separate membership evidence. Atlas 2.0 and its 623-row validity census remain historical; this census does not validate every 2.1 record. Historical live_count is never used as a result count.`),
    node('p','Mechanic references use verbatim Wizards rules and attributed article excerpts. Card-specific citations identify the named example; labels without verified official sources are flagged. The general flavor-word rule does not verify individual labels. Linked rules use the Wizards snapshot of 2026-09-25. Rosewater 2021 placement describes historic design, not current legality. Scryfall supplies the imported card text and keyword metadata.'));
  sourceNotes.append(node('p',`Provider vocabulary audit ${mechanicIndex.vocabularyVersion} · SHA-256 ${mechanicIndex.auditSha256}`,'mono'));
  for(const source of catalog.sources)sourceNotes.append(node('p',`${source.path} · SHA-256 ${source.sha256}`,'mono'));
}catch(error){$('source-notes').textContent=error.message;safeStatus($('discovery-status'),`Source catalog blocked: ${error.message}`,true);renderMechanics();}
