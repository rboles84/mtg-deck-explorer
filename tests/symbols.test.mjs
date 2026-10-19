import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describeManaSymbol, tokenizeMana, describeSetSymbol, SET_CODES } from '../public/symbols.mjs';

test('mana token rendering covers actual costs and preserves unsupported syntax without HTML parsing', () => {
  const input = '<img src=x onerror=bad()> Pay {2}{W}{U/B}{2/G}{R/P}{G/U/P}, {T}: add {C}. {FUTURE} {}';
  const tokens = tokenizeMana(input);
  assert.equal(tokens.map(token => token.text).join(''), input);
  assert.deepEqual(tokens.filter(token => token.type === 'symbol').map(token => token.className), [
    'ms ms-cost ms-2', 'ms ms-cost ms-w', 'ms ms-cost ms-ub', 'ms ms-cost ms-2g',
    'ms ms-cost ms-rp', 'ms ms-cost ms-gup', 'ms ms-cost ms-tap', 'ms ms-cost ms-c'
  ]);
  assert.ok(tokens.some(token => token.type === 'text' && token.text === '{FUTURE}'));
  assert.equal(describeManaSymbol('{constructor}'), null);
  assert.equal(describeManaSymbol('{W"><script>}'), null);
  assert.equal(describeManaSymbol('{21}'), null);
  assert.equal(describeManaSymbol('{B/U}'), null);
  assert.match(describeManaSymbol('{W/U/P}').label, /white mana, one blue mana, or two life/);
  assert.equal(describeManaSymbol('{S}').label, 'One snow mana');
  assert.equal(describeManaSymbol('{Q}').label, 'Untap');
  assert.deepEqual(tokenizeMana(null), []);
});

test('every emitted mana glyph exists in the pinned CSS', async () => {
  const css = await readFile(new URL('../public/vendor/mana/css/mana.css', import.meta.url), 'utf8');
  const candidates = ['W', 'U', 'B', 'R', 'G', 'C', '0', '20', '100', '1000000', 'X', 'Y', 'Z', 'T', 'Q', 'S', 'E', 'P', 'H', 'PW', 'CHAOS', 'TK', 'A', '∞', '½', 'W/U', 'W/B', 'U/B', 'U/R', 'B/R', 'B/G', 'R/W', 'R/G', 'G/W', 'G/U', 'W/P', 'U/P', 'B/P', 'R/P', 'G/P', 'W/U/P', 'G/U/P', '2/W', 'C/G'];
  for (const code of candidates) {
    const symbol = describeManaSymbol(code);
    assert.ok(symbol, code);
    assert.ok(css.includes('.' + symbol.className.split(' ').at(-1) + '::before'), code);
  }
});

test('set symbols use exact known set codes and preserve unknown codes without aliases', async () => {
  const css = await readFile(new URL('../public/vendor/keyrune/css/keyrune.css', import.meta.url), 'utf8');
  const declarations = [...css.matchAll(/^\.ss-([a-z0-9]{2,8}):before\s*\{\s*content:\s*"\\[a-f0-9]+";/gm)].map(match => match[1]).sort();
  assert.deepEqual(SET_CODES, [...new Set(declarations)]);
  assert.equal(describeSetSymbol({ set: 'DSC', set_name: 'Duskmourn Commander', rarity: 'rare' }).className, 'ss ss-dsc ss-rare');
  assert.equal(describeSetSymbol({ set: 'tsp' }).supported, true);
  assert.equal(describeSetSymbol({ set: 'ptsp' }).supported, false);
  assert.deepEqual(describeSetSymbol({ set: 'new99', set_name: 'Future Set' }), { code: 'new99', label: 'Future Set', supported: false, className: null });
  assert.equal(describeSetSymbol({ set: 'dsc ss-rare' }).supported, false);
  assert.equal(describeSetSymbol({ set: 'dsc', rarity: 'rare evil' }).className, 'ss ss-dsc');
});
