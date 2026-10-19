import {manaSymbols, identitySymbols, setSymbol} from './symbols.mjs';

const CARD_IMAGE_PATH = /^\/(normal|small|large)\/(front|back)\/[a-f0-9]\/[a-f0-9]\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(jpg|png|webp)$/i;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHARED_IMAGE_LAYOUTS = new Set(['split', 'flip', 'adventure']);
const FRAME_COLORS = Object.freeze({W: '#d6caa0', U: '#7faabd', B: '#a699b5', R: '#c98b75', G: '#9bb68d'});
const triggerCards = new WeakMap();
let installed = false, preview, detailDialog, detailBody, detailTitle;
let currentTrigger = null, hoverTrigger = null, focusTrigger = null, dismissTimer;
let scrollPreviewFrame = null;
let suppressedTrigger = null, pointerLeftSuppressed = false, focusLeftSuppressed = false;
let detailsReturnTrigger = null, detailsReturnContext = null;

/** The original objects remain untouched, including deeply frozen imported cards. */
export function getCardFaces(card) {
  return Array.isArray(card?.card_faces) && card.card_faces.length ? card.card_faces : [card || {}];
}

/** Use only this printing's supplied art. Missing DFC faces never borrow another face. */
export function getCardImageUrl(card, faceIndex = 0, {synthetic = false} = {}) {
  if (!card || synthetic || card.synthetic) return null;
  const faces = getCardFaces(card);
  if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= faces.length) return null;
  const face = faces[faceIndex];
  const candidates = [face?.image_uris];
  if (face !== card && SHARED_IMAGE_LAYOUTS.has(card.layout)) candidates.push(card.image_uris);
  for (const images of candidates) {
    for (const size of ['normal', 'large', 'small']) {
      if (typeof images?.[size] !== 'string') continue;
      try {
        const url = new URL(images[size]);
        const match = url.pathname.match(CARD_IMAGE_PATH);
        if (url.protocol !== 'https:' || url.hostname !== 'cards.scryfall.io' || url.username || url.password || url.port || !match) continue;
        if (UUID.test(card.id || '') && match[3].toLowerCase() !== card.id.toLowerCase()) continue;
        return url.href;
      } catch { /* Invalid remote fields use the same honest no-image state. */ }
    }
  }
  return null;
}

/** Viewport coordinates; returned dimensions also accommodate tiny browser windows. */
export function placeCardPreview(anchor, size, viewport) {
  const pad = Math.min(16, viewport.width / 10, viewport.height / 10), gap = 14;
  const width = Math.max(1, Math.min(size.width, viewport.width - pad * 2));
  const height = Math.max(1, Math.min(size.height, viewport.height - pad * 2));
  let left, top;
  if (anchor.right + gap + width <= viewport.width - pad) {
    left = anchor.right + gap; top = anchor.top - 18;
  } else if (anchor.left - gap - width >= pad) {
    left = anchor.left - gap - width; top = anchor.top - 18;
  } else {
    left = anchor.left;
    const below = viewport.height - anchor.bottom - gap - pad;
    const above = anchor.top - gap - pad;
    top = below >= height || below >= above ? anchor.bottom + gap : anchor.top - height - gap;
  }
  return {
    left: Math.max(pad, Math.min(left, viewport.width - width - pad)),
    top: Math.max(pad, Math.min(top, viewport.height - height - pad)),
    width, height,
  };
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function symbolText(text, className) {
  const el = element('p', className);
  el.append(manaSymbols(text || ''));
  return el;
}

function printingLabel(card) {
  return `${card.set_name || card.set?.toUpperCase() || 'Set unavailable'} · ${card.collector_number || 'Number unavailable'} · ${(card.lang || 'en').toUpperCase()}`;
}

function applyColorFrame(target, card) {
  const supplied = Array.isArray(card.color_identity) ? card.color_identity : null;
  const codes = Object.keys(FRAME_COLORS).filter(code => supplied?.includes(code));
  const known = supplied && (codes.length || supplied.length === 0);
  target.dataset.cardColors = known ? codes.join('') || 'C' : 'unknown';
  target.dataset.cardColorMode = !known ? 'unknown' : codes.length > 1 ? 'multi' : codes.length ? 'mono' : 'colorless';
  const colors = codes.map(code => FRAME_COLORS[code]);
  const accent = colors.length === 1 ? colors[0] : !known || colors.length > 1 ? '#d8bd81' : '#aeb7b4';
  target.style.setProperty('--card-frame-accent', accent);
  // Only the frame receives this trace. Original card pixels retain their own colors.
  target.style.setProperty('--card-frame-trace', `linear-gradient(100deg, ${(colors.length > 1 ? colors : [accent, accent]).join(', ')})`);
}

function safePrintingLink(card) {
  if (card.synthetic || !card.scryfall_uri) return null;
  try {
    const url = new URL(card.scryfall_uri);
    if (url.protocol !== 'https:' || url.hostname !== 'scryfall.com' || url.username || url.password || url.port || !url.pathname.startsWith('/card/')) return null;
    const link = element('a', 'card-printing-link', 'View this printing on Scryfall ↗');
    link.href = url.href; link.target = '_blank'; link.rel = 'noreferrer noopener';
    return link;
  } catch { return null; }
}

function cardArt(card, faceIndex, synthetic, compact = false, {lazy = false, phrasing = false, identifyUnavailable = false} = {}) {
  const frame = element(phrasing ? 'span' : 'div', `card-art-frame${compact ? ' card-art-compact' : ''}`);
  const face = getCardFaces(card)[faceIndex];
  const placeholder = element(phrasing ? 'span' : 'div', 'card-art-placeholder');
  const showUnavailable = (status, description) => {
    placeholder.replaceChildren(element('span', 'card-art-placeholder-mark', '◇'));
    if (identifyUnavailable) placeholder.append(element('strong', 'card-art-placeholder-name', face.name || card.name || 'Unnamed card'), element('span', '', status));
    else placeholder.append(element('strong', '', status));
    placeholder.append(element('span', '', description));
  };
  frame.dataset.artState = synthetic ? 'synthetic' : 'unavailable';
  showUnavailable(synthetic ? 'Fixture card' : 'Art unavailable', synthetic ? 'Invented demonstration card. No image is requested.' : 'An image for this exact printing is not available.');
  frame.append(placeholder);
  const url = getCardImageUrl(card, faceIndex, {synthetic});
  if (!url) return frame;
  frame.dataset.artState = 'loading';
  placeholder.replaceChildren(element('span', 'card-art-placeholder-mark', '◇'), element('strong', '', 'Loading printing…'));
  const img = element('img', 'card-art-image');
  img.alt = `${face.name || card.name || 'Card'} — ${card.set?.toUpperCase() || 'exact printing'} ${card.collector_number || ''}`;
  img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.loading = lazy ? 'lazy' : 'eager';
  img.width = 488; img.height = 680;
  img.addEventListener('load', () => { placeholder.hidden = true; img.classList.add('is-loaded'); frame.dataset.artState = 'ready'; }, {once: true});
  img.addEventListener('error', () => {
    img.remove();
    frame.dataset.artState = 'error';
    showUnavailable('Image unavailable', 'The exact-printing image could not load. Card text is still available.');
  }, {once: true});
  frame.append(img); img.src = url;
  return frame;
}

function findTrigger(target) {
  const trigger = target?.closest?.('[data-card-preview]');
  return trigger && triggerCards.has(trigger) ? trigger : null;
}

function updateDescription(trigger, attach) {
  if (!trigger) return;
  const ids = (trigger.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== 'card-hover-preview');
  if (attach) ids.push('card-hover-preview');
  if (ids.length) trigger.setAttribute('aria-describedby', ids.join(' '));
  else trigger.removeAttribute('aria-describedby');
}

function suppress(trigger) {
  suppressedTrigger = trigger; pointerLeftSuppressed = false; focusLeftSuppressed = false;
}

export function closeCardPreview() {
  clearTimeout(dismissTimer);
  if (scrollPreviewFrame !== null) {
    window.cancelAnimationFrame(scrollPreviewFrame);
    scrollPreviewFrame = null;
  }
  updateDescription(currentTrigger, false);
  if (preview) preview.hidden = true;
  currentTrigger = null;
}

function scheduleDismiss() {
  clearTimeout(dismissTimer);
  // A short crossing grace keeps the preview open between the name and its surface.
  dismissTimer = setTimeout(() => {
    if (focusTrigger?.isConnected) {
      if (focusTrigger !== currentTrigger) showPreview(focusTrigger, 'focus');
    } else {
      focusTrigger = null;
      closeCardPreview();
    }
  }, 160);
}

function scheduleFocusedPreview(trigger = findTrigger(document.activeElement)) {
  if (!trigger || triggerCards.get(trigger)?.visual || trigger === suppressedTrigger || document.querySelector('dialog[open]')) return;
  if (scrollPreviewFrame !== null) window.cancelAnimationFrame(scrollPreviewFrame);
  scrollPreviewFrame = window.requestAnimationFrame(() => {
    scrollPreviewFrame = null;
    // Focus can arrive before the keyboard event that turns :focus-visible on.
    // Check the final input state here, after native focus scrolling and keydown.
    if (!trigger.isConnected || findTrigger(document.activeElement) !== trigger || !trigger.matches(':focus-visible') || trigger === suppressedTrigger || document.hidden || document.querySelector('dialog[open]')) return;
    const rect = trigger.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= width) return;
    focusTrigger = trigger;
    showPreview(trigger, 'focus');
  });
}

function showPreview(trigger, source) {
  clearTimeout(dismissTimer);
  if (triggerCards.get(trigger)?.visual) { closeCardPreview(); return; }
  if (!trigger?.isConnected || detailDialog?.open) return;
  if (trigger === suppressedTrigger) {
    if ((source === 'pointer' && pointerLeftSuppressed) || (source === 'focus' && focusLeftSuppressed)) suppressedTrigger = null;
    else return;
  } else suppressedTrigger = null;
  if (currentTrigger === trigger && !preview.hidden) return;
  closeCardPreview();
  const {card, synthetic} = triggerCards.get(trigger);
  const face = getCardFaces(card)[0];
  const copy = element('div', 'card-preview-copy');
  copy.append(element('span', 'card-preview-kicker', synthetic ? 'Synthetic fixture' : 'Exact printing'), element('strong', 'card-preview-name', face.name || card.name || 'Unnamed card'));
  if (face.mana_cost || card.mana_cost) copy.append(symbolText(face.mana_cost || card.mana_cost, 'card-preview-mana'));
  copy.append(element('span', 'card-preview-printing', printingLabel(card)));
  if (face.type_line || card.type_line) copy.append(element('p', 'card-preview-type', face.type_line || card.type_line));
  copy.append(element('span', 'card-preview-rules-label', synthetic ? 'Authored sample rules' : 'Current Oracle text'));
  copy.append(symbolText(face.oracle_text || card.oracle_text || 'Rules text is not available for this printing.', 'card-preview-rules'));
  if (getCardFaces(card).length > 1) copy.append(element('span', 'card-preview-face-note', `${getCardFaces(card).length} faces · inspect to switch`));
  copy.append(element('span', 'card-preview-hint', 'Click or press Enter to inspect'));
  preview.replaceChildren(cardArt(card, 0, synthetic, true), copy);
  applyColorFrame(preview, card);
  const parent = trigger.closest('dialog[open]') || document.body;
  if (preview.parentElement !== parent) parent.append(preview);
  preview.style.maxHeight = ''; preview.style.width = '';
  preview.hidden = false;
  currentTrigger = trigger;
  updateDescription(trigger, true);
  const anchor = trigger.getBoundingClientRect();
  const viewport = {width: document.documentElement.clientWidth, height: window.innerHeight};
  // CSS viewport units include the scrollbar. Constrain the actual box to the
  // usable client width before measuring its wrapped content and placement.
  preview.style.width = `${Math.min(preview.getBoundingClientRect().width, Math.max(1, viewport.width - 32))}px`;
  const size = preview.getBoundingClientRect();
  // When both horizontal edges are constrained, reserve the larger vertical side.
  if (anchor.right + 14 + size.width > viewport.width - 16 && anchor.left - 14 - size.width < 16) {
    const room = Math.max(viewport.height - anchor.bottom - 30, anchor.top - 30);
    if (room >= 100) preview.style.maxHeight = `${room}px`;
  }
  const position = placeCardPreview(anchor, preview.getBoundingClientRect(), viewport);
  preview.style.left = `${position.left}px`; preview.style.top = `${position.top}px`;
}

function ensureDialog() {
  if (detailDialog) return;
  detailDialog = element('dialog', 'card-details-dialog');
  detailDialog.setAttribute('aria-labelledby', 'card-details-title');
  const header = element('header', 'card-details-header');
  const heading = element('div');
  heading.append(element('span', 'card-preview-kicker', 'Printing viewer'));
  detailTitle = element('h2', '', 'Card details'); detailTitle.id = 'card-details-title';
  heading.append(detailTitle);
  const close = element('button', 'card-details-close', '×');
  close.type = 'button'; close.setAttribute('aria-label', 'Close card details'); close.autofocus = true;
  close.addEventListener('click', () => { suppress(detailsReturnTrigger); detailDialog.close(); });
  header.append(heading, close);
  detailBody = element('div', 'card-details-body');
  detailDialog.append(header, detailBody);
  detailDialog.addEventListener('cancel', () => suppress(detailsReturnTrigger));
  detailDialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...detailDialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]')]
      .filter(control => control.tabIndex >= 0 && !control.closest('[hidden], [inert]') && control.getClientRects().length > 0);
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0], last = controls[controls.length - 1], active = document.activeElement;
    if (event.shiftKey && (active === first || !detailDialog.contains(active))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (active === last || !detailDialog.contains(active))) {
      event.preventDefault(); first.focus();
    }
  });
  detailDialog.addEventListener('close', () => {
    closeCardPreview();
    const trigger = detailsReturnTrigger, context = detailsReturnContext;
    suppress(trigger); detailsReturnTrigger = null; detailsReturnContext = null;
    if (trigger?.isConnected) {
      trigger.focus({preventScroll: true});
    } else if (context?.isConnected && !context.closest('[hidden], [inert]') && context.getClientRects().length) {
      // A pending result page can replace its grid while a card is being read.
      // Return to that same task's surviving control, never an unrelated card.
      if (context.id === 'discovery') {
        const page = context.querySelector('#discovery-page-top:not([disabled])');
        (page?.getClientRects().length ? page : context).focus({preventScroll: true});
      } else if (context.matches('dialog[open]')) {
        const control = [...context.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]')]
          .find(candidate => candidate.tabIndex >= 0 && !candidate.closest('[hidden], [inert]') && candidate.getClientRects().length);
        (control || context).focus({preventScroll: true});
      } else if (!context.matches('dialog')) {
        context.focus({preventScroll: true});
      }
    }
  });
  // A backdrop click dismisses without treating drags from inside as outside clicks.
  let beganOnBackdrop = false;
  detailDialog.addEventListener('pointerdown', event => {
    const rect = detailDialog.getBoundingClientRect();
    beganOnBackdrop = event.target === detailDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
  });
  detailDialog.addEventListener('click', event => {
    if (!beganOnBackdrop || event.target !== detailDialog) return;
    const rect = detailDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      suppress(detailsReturnTrigger); detailDialog.close();
    }
    beganOnBackdrop = false;
  });
  document.body.append(detailDialog);
}

/**
 * Optional host-owned action; this module never reads or writes Clipboard state.
 * getQuantity() returns the current count. onSave() adds one copy and returns the
 * resulting count (or a Promise for it); getQuantity is the fallback when the
 * callback omits its return value.
 */
function cardSaveAction(saveAction) {
  const area = element('div', 'card-details-save-area');
  const button = element('button', 'card-details-save', 'Save to Clipboard');
  const status = element('p', 'card-details-save-status');
  button.type = 'button';
  status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const validQuantity = value => Number.isSafeInteger(value) && value >= 0;
  const readQuantity = () => {
    try {
      const value = saveAction.getQuantity?.();
      return validQuantity(value) ? value : null;
    } catch { return null; }
  };
  let quantity = readQuantity(), pending = false;
  const renderQuantity = value => {
    quantity = value;
    button.textContent = value > 0 ? 'Save another copy' : 'Save to Clipboard';
    status.textContent = value === null ? 'Save this printing to your Clipboard.' : value === 0 ? 'Not saved yet' : `${value} ${value === 1 ? 'copy' : 'copies'} in Clipboard`;
  };
  renderQuantity(quantity);
  button.addEventListener('click', async () => {
    if (pending) return;
    pending = true;
    button.setAttribute('aria-disabled', 'true');
    area.setAttribute('aria-busy', 'true');
    button.textContent = 'Saving…';
    status.textContent = 'Saving this printing…';
    try {
      const result = await saveAction.onSave();
      const savedQuantity = validQuantity(result) ? result : readQuantity();
      renderQuantity(savedQuantity);
      if (savedQuantity === null) status.textContent = 'Saved to Clipboard';
    } catch {
      // An action failure leaves the exact printing and the selected face open.
      renderQuantity(readQuantity() ?? quantity);
      status.textContent = 'Could not save this printing. Try again.';
    } finally {
      pending = false;
      button.removeAttribute('aria-disabled');
      area.removeAttribute('aria-busy');
    }
  });
  area.append(button, status);
  return area;
}

/** Opens above an existing native modal; an optional saveAction stays host-owned. */
export function openCardDetails(card, trigger, {synthetic = false, saveAction} = {}) {
  if (!card || typeof card !== 'object') return;
  installCardPreviews(); ensureDialog();
  synthetic = Boolean(synthetic || card.synthetic);
  suppress(trigger); closeCardPreview();
  detailsReturnTrigger = trigger || document.activeElement;
  detailsReturnContext = detailsReturnTrigger?.closest('dialog[open], #discovery, #archive-view, #mechanics-view') || null;
  const faces = getCardFaces(card);
  detailTitle.textContent = card.name || 'Card details';
  applyColorFrame(detailDialog, card);
  detailBody.replaceChildren();
  const artColumn = element('div', 'card-details-art-column');
  const artHost = element('div');
  const copy = element('div', 'card-details-copy');
  const faceContent = element('div', 'card-face-content');
  faceContent.setAttribute('aria-live', 'polite'); faceContent.setAttribute('aria-atomic', 'true');
  const faceButtons = [];
  const showFace = index => {
    const face = faces[index];
    artHost.replaceChildren(cardArt(card, index, synthetic));
    faceContent.replaceChildren();
    if (faces.length > 1) faceContent.append(element('p', 'card-face-position', `Face ${index + 1} of ${faces.length}`), element('h3', 'card-face-name', face.name || `Face ${index + 1}`));
    if (face.mana_cost || (!card.card_faces && card.mana_cost)) faceContent.append(symbolText(face.mana_cost || card.mana_cost, 'card-details-mana'));
    if (face.type_line || card.type_line) faceContent.append(element('p', 'card-details-type', face.type_line || card.type_line));
    faceContent.append(element('p', 'card-details-rules-label', synthetic ? 'Authored sample rules' : 'Current Oracle text'));
    faceContent.append(symbolText(face.oracle_text || (!card.card_faces && card.oracle_text) || 'Rules text is not available for this face.', 'card-details-oracle'));
    const stats = [];
    if (face.power != null && face.toughness != null) stats.push(`${face.power} / ${face.toughness}`);
    if (face.loyalty != null) stats.push(`Loyalty ${face.loyalty}`);
    if (face.defense != null) stats.push(`Defense ${face.defense}`);
    if (stats.length) faceContent.append(element('p', 'card-details-stats', stats.join(' · ')));
    const flavor = face.flavor_text || (!card.card_faces && card.flavor_text);
    faceContent.append(element('blockquote', 'card-details-flavor', flavor || 'This face has no supplied flavor text.'));
    const artist = face.artist || card.artist;
    if (artist) faceContent.append(element('p', 'card-details-artist', `Illustrated by ${artist}`));
    faceButtons.forEach((button, buttonIndex) => button.setAttribute('aria-pressed', String(index === buttonIndex)));
  };
  artColumn.append(artHost);
  if (faces.length > 1) {
    const controls = element('div', 'card-face-switcher');
    controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Card face');
    faces.forEach((face, index) => {
      const button = element('button', 'card-face-button', face.name || `Face ${index + 1}`);
      button.type = 'button'; button.setAttribute('aria-pressed', String(index === 0));
      button.addEventListener('click', () => showFace(index));
      controls.append(button); faceButtons.push(button);
    });
    artColumn.append(controls);
  }
  if (!synthetic && typeof saveAction?.onSave === 'function') artColumn.append(cardSaveAction(saveAction));
  const metadata = element('div', 'card-details-metadata');
  const edition = element('p', 'card-details-edition'); edition.append(setSymbol(card), document.createTextNode(printingLabel(card)));
  metadata.append(edition);
  if (Array.isArray(card.color_identity)) {
    const identity = element('p', 'card-details-identity');
    identity.append(element('span', '', 'Color identity'), identitySymbols(card.color_identity));
    metadata.append(identity);
  }
  if (card.rarity) metadata.append(element('p', '', `${card.rarity.charAt(0).toUpperCase()}${card.rarity.slice(1)}${card.released_at ? ` · Released ${card.released_at}` : ''}`));
  if (synthetic) metadata.append(element('p', 'card-details-source', 'Synthetic fixture · authored example, not a real Magic card.'));
  else {
    metadata.append(element('p', 'card-details-source', 'Scryfall card data · exact resolved printing'));
    const link = safePrintingLink(card); if (link) metadata.append(link);
  }
  if (card.id) {
    const provenance = element('details', 'card-details-provenance');
    provenance.append(element('summary', '', 'Printing identifier'), element('code', '', card.id));
    metadata.append(provenance);
  }
  copy.append(faceContent, metadata); detailBody.append(artColumn, copy); showFace(0);
  if (!detailDialog.open) detailDialog.showModal();
  detailDialog.querySelector('.card-details-close').focus({preventScroll: true});
}

/** A semantic name button. The original card is retained privately, never serialized. */
export function cardTrigger(card, {label, className = '', synthetic = false, saveAction} = {}) {
  const trigger = element('button', `card-trigger ${className}`.trim(), label ?? card?.name ?? 'Inspect card');
  trigger.type = 'button'; trigger.dataset.cardPreview = '';
  trigger.setAttribute('aria-haspopup', 'dialog');
  triggerCards.set(trigger, {card: card || {}, synthetic: Boolean(synthetic || card?.synthetic), saveAction});
  return trigger;
}

/** Visible exact-printing art. Caption is opt-in when the parent has no title. */
export function cardVisual(card, {className = '', synthetic = false, compact = false, label, caption = false, saveAction} = {}) {
  card = card || {};
  synthetic = Boolean(synthetic || card.synthetic);
  const trigger = element('button', `card-visual${compact ? ' card-visual-compact' : ''} ${className}`.trim());
  trigger.type = 'button'; trigger.dataset.cardPreview = ''; trigger.dataset.cardVisual = '';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-label', label || `Inspect ${card.name || 'card'}${synthetic ? ' · synthetic fixture' : ''}`);
  triggerCards.set(trigger, {card, synthetic, visual: true, saveAction});
  applyColorFrame(trigger, card);
  const art = cardArt(card, 0, synthetic, compact, {lazy: true, phrasing: true, identifyUnavailable: true});
  // The button's inspection label supplies its accessible name. Keeping the art
  // subtree decorative avoids repeating loading/error text as part of that name.
  art.setAttribute('aria-hidden', 'true');
  trigger.append(art);
  if (caption) {
    const text = element('span', 'card-visual-caption');
    text.append(element('strong', '', card.name || 'Unnamed card'), element('span', '', synthetic ? 'Synthetic fixture' : printingLabel(card)));
    trigger.append(text);
  }
  return trigger;
}

/** One delegated controller also covers cards added by imports, search, or drawers. */
export function installCardPreviews() {
  if (installed) return;
  installed = true;
  preview = element('div', 'card-hover-preview');
  preview.id = 'card-hover-preview'; preview.setAttribute('role', 'tooltip'); preview.hidden = true;
  document.body.append(preview);
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    if (preview.contains(event.target)) { clearTimeout(dismissTimer); return; }
    const trigger = findTrigger(event.target);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    hoverTrigger = trigger; showPreview(trigger, 'pointer');
  });
  document.addEventListener('pointerout', event => {
    if (event.pointerType === 'touch') return;
    const trigger = findTrigger(event.target);
    if (trigger && !trigger.contains(event.relatedTarget)) {
      hoverTrigger = null;
      if (trigger === suppressedTrigger && !preview.contains(event.relatedTarget)) pointerLeftSuppressed = true;
      if (!preview.contains(event.relatedTarget)) scheduleDismiss();
    }
    if (preview.contains(event.target) && !preview.contains(event.relatedTarget)) {
      if (findTrigger(event.relatedTarget) !== currentTrigger) scheduleDismiss();
    }
  });
  document.addEventListener('focusin', event => {
    const trigger = findTrigger(event.target);
    if (!trigger) {
      focusTrigger = null;
      if (!hoverTrigger) scheduleDismiss();
      return;
    }
    focusTrigger = trigger; showPreview(trigger, 'focus');
  });
  document.addEventListener('focusout', event => {
    const trigger = findTrigger(event.target);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    focusTrigger = null;
    if (trigger === suppressedTrigger) focusLeftSuppressed = true;
    if (hoverTrigger !== trigger) scheduleDismiss();
  });
  document.addEventListener('click', event => {
    const trigger = findTrigger(event.target);
    if (!trigger) return;
    const data = triggerCards.get(trigger);
    openCardDetails(data.card, trigger, {synthetic: data.synthetic, saveAction: data.saveAction});
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!currentTrigger || preview.hidden) return;
      suppress(currentTrigger); closeCardPreview();
      // Dismiss the transient preview first, leaving a surrounding modal open.
      event.preventDefault(); event.stopPropagation();
      return;
    }
    if (!event.altKey && !event.ctrlKey && !event.metaKey && !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
      // A focused name may have been focused by script or pointer before the
      // first navigation key. Keyboard intent must not depend on a new focusin.
      scheduleFocusedPreview(findTrigger(event.target));
    }
  }, true);
  document.addEventListener('scroll', event => {
    if (preview.contains(event.target)) return;
    closeCardPreview();
    // Keyboard focus can scroll a name into view after focusin has already opened
    // its preview. Wait for the new geometry, then restore only that focused name.
    scheduleFocusedPreview();
  }, true);
  window.addEventListener('resize', closeCardPreview);
  window.addEventListener('blur', closeCardPreview);
  document.addEventListener('visibilitychange', () => { if (document.hidden) closeCardPreview(); });
}
