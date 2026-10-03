import test from 'node:test';
import assert from 'node:assert/strict';
import { guardClaimSemantics } from '../src/ai/semantics.mjs';
test('lack of a client position cannot become a non-dispute assertion', () => {
  const fact = { field: 'disputed', type: 'boolean', boolean_value: false, source_id: 'doc', quote: 'Stanowisko dłużnika wymaga osobnego potwierdzenia.' };
  const flags = guardClaimSemantics({ facts: [fact] }, [{ id: 'doc', text: fact.quote }]);
  assert.equal(fact.type, 'unknown'); assert.equal(fact.boolean_value, null); assert.equal(flags[0].code, 'NO_EXPLICIT_NON_DISPUTE_STATEMENT');
  assert.equal(fact.source_id, 'doc');
});
test('explicit client position is retained and original creditor needs transfer context', () => {
  const output = { facts: [{ field: 'disputed', type: 'boolean', boolean_value: false, quote: 'Nie kwestionuję roszczenia.' },
    { field: 'original_creditor', type: 'text', text_value: 'Bank\nAlfa', quote: 'Bank Alfa' }] };
  guardClaimSemantics(output, [{ text: 'Wierzyciel: Bank Alfa.' }]);
  assert.equal(output.facts[0].boolean_value, false); assert.equal(output.facts[1].type, 'unknown');
  const assigned = { field: 'original_creditor', type: 'text', text_value: 'Bank\nAlfa', quote: 'Bank Alfa' };
  assert.equal(guardClaimSemantics({ facts: [assigned] }, [{ text: 'Po cesji poprzedni wierzyciel: Bank Alfa.' }]).length, 0);
  assert.equal(assigned.text_value, 'Bank Alfa');
});
