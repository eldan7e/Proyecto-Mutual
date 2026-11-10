import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSearchText,
  getSearchTokens,
  matchesSearchTokens,
  applySociosSearchFilter
} from './searchUtils.js';

test('normalizes case and diacritics', () => {
  assert.equal(normalizeSearchText('  Gaetano, María Laura '), 'gaetano, maria laura');
  assert.equal(normalizeSearchText('Tribiño, Gastón'), 'tribino, gaston');
});

test('splits commas and parentheses into clean tokens', () => {
  assert.deepEqual(getSearchTokens('Caferra, Maximo'), ['caferra', 'maximo']);
  assert.deepEqual(getSearchTokens('MARIA LAURA'), ['maria', 'laura']);
  assert.deepEqual(getSearchTokens('Navas (Hijo)'), ['navas', 'hijo']);
});

test('matchesSearchTokens ignores case, accents, commas, and word order', () => {
  assert.equal(matchesSearchTokens('Caferra, Maximo Amilcar', 'caferra maximo'), true);
  assert.equal(matchesSearchTokens('Caferra, Maximo Amilcar', 'MAXIMO CAFERRA'), true);
  assert.equal(matchesSearchTokens('Caferra, Maximo Amilcar', 'Caferra, Maximo'), true);
  assert.equal(matchesSearchTokens('Gaetano, María Laura', 'maria laura'), true);
  assert.equal(matchesSearchTokens('Tribiño, Guillermo', 'tribino'), true);
  assert.equal(matchesSearchTokens('Caferra, Maximo Amilcar', 'caferra oscar'), false);
});

test('applySociosSearchFilter handles numeric, formatted phone, and tokenized text queries', () => {
  const createMockQuery = () => {
    const calls = [];
    const q = {
      calls,
      or(expr) { calls.push(['or', expr]); return q; },
      ilike(col, pat) { calls.push(['ilike', col, pat]); return q; }
    };
    return q;
  };

  const qText = applySociosSearchFilter(createMockQuery(), 'Caferra, Maximo');
  assert.deepEqual(qText.calls, [
    ['ilike', 'search_text', '%caferra%'],
    ['ilike', 'search_text', '%maximo%']
  ]);

  const qUpper = applySociosSearchFilter(createMockQuery(), 'MARÍA LAURA');
  assert.deepEqual(qUpper.calls, [
    ['ilike', 'search_text', '%maria%'],
    ['ilike', 'search_text', '%laura%']
  ]);

  const qPhone = applySociosSearchFilter(createMockQuery(), '221-547-8264');
  assert.deepEqual(qPhone.calls, [
    ['ilike', 'search_text', '%2215478264%']
  ]);

  const qNum = applySociosSearchFilter(createMockQuery(), '426');
  assert.equal(qNum.calls.length, 1);
  assert.equal(qNum.calls[0][0], 'or');
  assert.ok(qNum.calls[0][1].includes('nro_socio.eq.426'));
  assert.ok(qNum.calls[0][1].includes('grupo_codigo_str.imatch.\\y426\\y'));
});
