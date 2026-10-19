// Glyph names are pinned to Mana 1.17.1 and Keyrune 3.19.0; see vendor/SOURCES.md.
export const COLOR_NAMES = Object.freeze({ W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' });
const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];
// Exact selectors extracted from the vendored Keyrune set-glyph declarations.
// A missing code is displayed as text; no parent-set or promotional aliases are inferred.
export const SET_CODES = Object.freeze(["10e","1e","2e","2ed","2u","2x2","2xm","30a","3e","3ed","40k","4ed","5dn","5ed","6ed","7ed","8ed","9ed","a25","acr","aer","afc","afr","akh","akr","ala","all","ann","apc","arb","arc","arn","ath","atq","avr","azorius","bbd","bcore","bfz","big","blb","blc","bng","bok","boros","bot","br","brb","brc","bro","brr","btd","c13","c14","c15","c16","c17","c18","c19","c20","c21","cc1","cc2","chk","chr","clb","clu","cm1","cm2","cma","cmc","cmd","cmm","cn2","cns","con","csp","dd2","ddc","ddd","dde","ddf","ddg","ddh","ddi","ddj","ddk","ddl","ddm","ddn","ddo","ddp","ddq","ddr","dds","ddt","ddu","dft","dgm","dimir","dis","dka","dkm","dmc","dmr","dmu","dom","dpa","drb","drc","drk","dsc","dsk","dst","dtk","dvk","e02","ea1","ecc","ecl","eld","ema","emn","eoc","eoe","eos","eve","evg","exo","exp","fca","fdc","fdn","fem","fic","fin","fra","frf","fut","gk1","gk2","gn2","gn3","gnt","golgari","gpt","gruul","gs1","gtc","h09","h17","ha1","hbg","hml","hob","hoc","hop","hou","htr17","ice","ice2","iko","ima","inr","inv","isd","izzet","j20","j21","j22","j25","j25a","jmp","jou","jud","khc","khm","kld","klr","ktk","lcc","lci","lea","leb","leg","lgn","lrw","ltc","ltr","m10","m11","m12","m13","m14","m15","m19","m20","m21","m3c","mar","mat","mb1","mb2","mbs","md1","me1","me2","me3","me4","med","mh1","mh2","mh3","mic","mid","mir","mkc","mkm","mm2","mm3","mma","mmq","moc","mom","mor","mp1","mp2","mrd","msc","msh","mul","ncc","nec","neo","nms","nph","ody","ogw","om1","omb","onc","one","ons","ori","orzhov","otc","otj","otp","papac","parl","parl2","parl3","past","pbook","pc2","pca","pcy","pd2","pd3","pdep","pdrc","peuro","pfnm","pgru","pheart","pidw","pio","pip","plc","pleaf","pls","pm2","pma","pmodo","pmps","pmpu","pmtg1","pmtg2","po2","por","psega","psld","psum","ptg","ptk","ptsa","pxbox","pz2","pza","rakdos","rav","rex","rix","roe","rtr","rvr","s00","s99","scd","scg","selesnya","shm","simic","sir","sis","sld","sld2","slu","snc","soa","soc","soi","sok","som","sos","spe","spg","spm","ss1","ss2","ss3","sta","sth","stx","td2","tdc","tdm","thb","ths","tla","tle","tmc","tmp","tmt","tor","tpr","tsp","tsr","uds","ugl","ulg","uma","una","und","unf","unh","usg","ust","v09","v0x","v10","v11","v12","v13","v14","v15","v16","v17","van","vis","vma","voc","vow","w16","w17","war","who","woc","woe","wot","wth","wwk","x2ps","x4ea","xcle","xduels","xice","xlcu","xln","xmods","xren","xrin","y26","yeoe","yone","ysnc","ywoe","zen","znc","zne","znr"]);
const supportedSets = new Set(SET_CODES);
const HYBRIDS = new Set(['W/U', 'W/B', 'U/B', 'U/R', 'B/R', 'B/G', 'R/W', 'R/G', 'G/W', 'G/U']);
const fontLoads = new Map();

export function describeManaSymbol(token) {
  if (typeof token !== 'string') return null;
  const code = token.startsWith('{') && token.endsWith('}') ? token.slice(1, -1) : token;
  if (Object.hasOwn(COLOR_NAMES, code)) return { className: 'ms ms-cost ms-' + code.toLowerCase(), label: 'One ' + COLOR_NAMES[code].toLowerCase() + ' mana' };
  if (/^(?:[0-9]|1[0-9]|20|100|1000000)$/.test(code)) return { className: 'ms ms-cost ms-' + code, label: code + ' generic mana' };
  if (/^[XYZ]$/.test(code)) return { className: 'ms ms-cost ms-' + code.toLowerCase(), label: code + ' generic mana' };
  if (code === 'H') return { className: 'ms ms-p', label: 'Phyrexian mana symbol' };
  if (code === 'PW') return { className: 'ms ms-planeswalker', label: 'Planeswalker symbol' };
  const special = { T: ['tap', 'Tap'], Q: ['untap', 'Untap'], S: ['s', 'One snow mana'], E: ['e', 'Energy'], P: ['p', 'Phyrexian mana'], CHAOS: ['chaos', 'Chaos'], TK: ['ticket', 'Ticket'], A: ['acorn', 'Acorn'], '∞': ['infinity', 'Infinite generic mana'], '½': ['1-2', 'One-half generic mana'] };
  if (Object.hasOwn(special, code)) {
    const [glyph, label] = special[code];
    return { className: 'ms ms-cost ms-' + glyph, label };
  }
  if (HYBRIDS.has(code)) {
    const colors = code.split('/');
    return { className: 'ms ms-cost ms-' + colors.join('').toLowerCase(), label: 'One ' + COLOR_NAMES[colors[0]].toLowerCase() + ' or ' + COLOR_NAMES[colors[1]].toLowerCase() + ' mana' };
  }
  if (/^[2C]\/[WUBRG]$/.test(code)) {
    const [first, color] = code.split('/');
    return { className: 'ms ms-cost ms-' + (first + color).toLowerCase(), label: (first === '2' ? 'Two generic' : 'One colorless') + ' or one ' + COLOR_NAMES[color].toLowerCase() + ' mana' };
  }
  if (/^[WUBRG]\/P$/.test(code)) return { className: 'ms ms-cost ms-' + code.replace('/', '').toLowerCase(), label: 'One ' + COLOR_NAMES[code[0]].toLowerCase() + ' mana or two life' };
  if (code.endsWith('/P') && HYBRIDS.has(code.slice(0, -2))) {
    const [first, second] = code.split('/');
    return { className: 'ms ms-cost ms-' + (first + second + 'p').toLowerCase(), label: 'One ' + COLOR_NAMES[first].toLowerCase() + ' mana, one ' + COLOR_NAMES[second].toLowerCase() + ' mana, or two life' };
  }
  return null;
}

export function tokenizeMana(value) {
  const text = typeof value === 'string' ? value : '';
  const tokens = [];
  let cursor = 0;
  for (const match of text.matchAll(/\{[^{}\r\n]+\}/g)) {
    if (match.index > cursor) tokens.push({ type: 'text', text: text.slice(cursor, match.index) });
    const symbol = describeManaSymbol(match[0]);
    tokens.push(symbol ? { type: 'symbol', text: match[0], ...symbol } : { type: 'text', text: match[0] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) tokens.push({ type: 'text', text: text.slice(cursor) });
  return tokens;
}

function readyFont(name) {
  if (!fontLoads.has(name)) {
    const fontSet = globalThis.document?.fonts;
    fontLoads.set(name, fontSet?.load ? fontSet.load('16px "' + name + '"').then(faces => faces.length > 0).catch(() => false) : Promise.resolve(false));
  }
  return fontLoads.get(name);
}

function symbolNode(className, label, fallback, family) {
  const node = document.createElement('span');
  node.className = 'mtg-symbol';
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', label);
  node.title = label;
  const glyph = document.createElement('span');
  glyph.className = 'symbol-glyph';
  glyph.hidden = true;
  glyph.setAttribute('aria-hidden', 'true');
  const icon = document.createElement('i');
  icon.className = className;
  glyph.append(icon);
  const text = document.createElement('span');
  text.className = 'symbol-fallback';
  text.setAttribute('aria-hidden', 'true');
  text.textContent = fallback;
  node.append(glyph, text);
  // Text stays visible until the actual local icon face has loaded successfully.
  readyFont(family).then(loaded => { if (loaded) { glyph.hidden = false; text.hidden = true; } });
  return node;
}

export function manaSymbols(value) {
  const fragment = document.createDocumentFragment();
  for (const token of tokenizeMana(value)) {
    fragment.append(token.type === 'symbol' ? symbolNode(token.className, token.label, token.text, 'Mana') : document.createTextNode(token.text));
  }
  return fragment;
}

export function identitySymbols(codes) {
  const supplied = Array.isArray(codes) ? codes : typeof codes === 'string' ? [...codes] : [];
  const colors = COLOR_ORDER.filter(code => supplied.includes(code));
  const unknown = supplied.filter(code => !COLOR_ORDER.includes(code) && code !== 'C');
  const node = document.createElement('span');
  node.className = 'identity-symbols';
  node.setAttribute('role', 'img');
  const names = colors.length ? colors.map(code => COLOR_NAMES[code]) : [unknown.length ? 'Unknown' : 'Colorless'];
  node.setAttribute('aria-label', names.join(', ') + ' color identity');
  node.title = names.join(', ') + ' color identity';
  for (const code of colors.length ? colors : unknown.length ? [] : ['C']) {
    const description = describeManaSymbol(code);
    const icon = symbolNode(description.className, COLOR_NAMES[code], code, 'Mana');
    icon.setAttribute('aria-hidden', 'true');
    node.append(icon);
  }
  if (unknown.length) node.append(document.createTextNode(unknown.map(String).join(' ')));
  return node;
}

export function describeSetSymbol(card = {}) {
  const code = typeof card?.set === 'string' && /^[a-z0-9]{2,8}$/i.test(card.set) ? card.set.toLowerCase() : '';
  const rarity = ['common', 'uncommon', 'rare', 'mythic'].includes(card?.rarity) ? card.rarity : '';
  const label = (typeof card?.set_name === 'string' && card.set_name ? card.set_name : code.toUpperCase() || 'Unknown set') + (rarity ? ', ' + rarity : '');
  return { code, label, supported: supportedSets.has(code), className: supportedSets.has(code) ? 'ss ss-' + code + (rarity ? ' ss-' + rarity : '') : null };
}

export function setSymbol(card) {
  const description = describeSetSymbol(card);
  if (description.supported) {
    const node = symbolNode(description.className, description.label, description.code.toUpperCase(), 'Keyrune');
    node.classList.add('set-symbol');
    return node;
  }
  const node = document.createElement('span');
  node.className = 'set-symbol set-symbol-fallback';
  node.textContent = description.code.toUpperCase() || '—';
  node.title = description.label + ' — set symbol unavailable';
  node.setAttribute('aria-label', node.title);
  return node;
}

