import {keywordKey, keywordStatus} from './mechanics.mjs';

// Explain confirmed exclusions among imported contributors, not the cause of
// an entire provider result set. Missing metadata must not become a diagnosis.
export function importedDiscoveryExclusions(deck, key, identity) {
  const validIdentity=value=>Array.isArray(value)&&value.every(c=>['W','U','B','R','G'].includes(c));
  const cards=new Map();
  for(const row of deck?.rows??[]){
    const card=row.card;
    if(!row.playable||row.status!=='resolved'||keywordStatus(card)!=='reported'||!card.keywords.some(k=>keywordKey(k)===key))continue;
    const notLegal=['banned','not_legal'].includes(card.legalities?.commander);
    const outsideIdentity=validIdentity(identity)&&validIdentity(card.color_identity)&&card.color_identity.some(c=>!identity.includes(c));
    if(notLegal||outsideIdentity)cards.set(card.oracle_id||card.id,{card,notLegal,outsideIdentity});
  }
  return [...cards.values()];
}
