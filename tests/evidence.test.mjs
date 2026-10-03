import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorEvidence } from '../src/ai/evidence.mjs';
import { validateExtraction } from '../src/ai/extraction.mjs';
const unknown = { field: 'original_creditor', type: 'unknown', text_value: null, boolean_value: null, minor_units: null,
  currency: null, as_of: null, precision: 'unknown', source_id: null, quote: null };
test('unique whitespace-only quote is restored to literal source and still passes strict validation', () => {
  const source = { id: 'doc', text: 'Kapitał: 67\u00a0000,00 PLN.\nŁącznie:\n67 000,00 PLN.' };
  const output = { facts: [{ ...unknown, field: 'total_amount', type: 'money', minor_units: 6700000, currency: 'PLN',
    as_of: '2026-09-30', precision: 'exact', source_id: source.id, quote: 'Łącznie: 67 000,00 PLN.' }], questions: [], warnings: [] };
  const repairs = anchorEvidence(output, [source]);
  assert.equal(output.facts[0].quote, 'Łącznie:\n67 000,00 PLN.'); assert.equal(repairs.length, 1);
  validateExtraction(output, { requested_fields: ['total_amount'], sources: [source] });
});
test('anchoring never changes an invented amount or ambiguous quote', () => {
  for (const [text, quote] of [['Łącznie: 19 000,00 PLN.', 'Łącznie: 18 000,00 PLN.'],
    ['Łącznie:\n19 000,00 PLN. Łącznie:\n19 000,00 PLN.', 'Łącznie: 19 000,00 PLN.']]) {
    const output = { facts: [{ ...unknown, field: 'total_amount', type: 'money', minor_units: 1800000, currency: 'PLN',
      precision: 'exact', source_id: 'doc', quote }], questions: [], warnings: [] };
    assert.equal(anchorEvidence(output, [{ id: 'doc', text }]).length, 0);
    assert.throws(() => validateExtraction(output, { requested_fields: ['total_amount'], sources: [{ id: 'doc', text }] }), { code: 'INVALID_EVIDENCE' });
  }
});
test('unknown without a quote loses a dangling reference; known values cannot lose missing evidence', () => {
  const output = { facts: [{ ...unknown, source_id: 'doc' }], questions: [], warnings: [] };
  assert.equal(anchorEvidence(output, []).length, 1); assert.equal(output.facts[0].source_id, null);
  validateExtraction(output, { requested_fields: ['original_creditor'], sources: [] });
  const known = { facts: [{ ...unknown, type: 'text', text_value: 'Bank', precision: 'exact', source_id: 'doc' }], questions: [], warnings: [] };
  assert.equal(anchorEvidence(known, [{ id: 'doc', text: 'Bank' }]).length, 0);
  assert.throws(() => validateExtraction(known, { requested_fields: ['original_creditor'], sources: [{ id: 'doc', text: 'Bank' }] }), { code: 'INVALID_VALUE_VARIANT' });
});
