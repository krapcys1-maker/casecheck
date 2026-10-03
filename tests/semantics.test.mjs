import test from 'node:test';
import assert from 'node:assert/strict';
import { guardClaimSemantics, guardCreditorAddress } from '../src/ai/semantics.mjs';

test('an address must belong to the current creditor rather than the sender, predecessor or debtor', () => {
  const address = 'ul. Dokumentowa 20, 00-000 Miasto Testowe';
  const create = () => ({ facts: [{ field: 'creditor_address', type: 'text', text_value: address, source_id: 's', quote: address }], warnings: [] });
  const transfer = `Nadawca: Bank Testowy Alfa S.A.. Adres: ${address}. Wierzytelność przeniesiono na Fundusz Testowy Delta.`;
  const output = create();
  assert.equal(guardCreditorAddress(output, [{ id: 's', text: transfer }], 'Fundusz Testowy Delta')[0].code, 'CREDITOR_ADDRESS_ROLE_UNVERIFIED');
  assert.equal(output.facts[0].type, 'unknown'); assert.equal(output.facts[0].quote, address);
  for (const text of [`Nadawca: Finanse Testowe Epsilon sp. z o.o.. Adres: ${address}.`, `Wierzyciel: Finanse Testowe Epsilon sp. z o.o., ${address}.`]) {
    const result = create(); assert.equal(guardCreditorAddress(result, [{ id: 's', text }], 'Finanse Testowe Epsilon sp. z o.o.').length, 0);
    assert.equal(result.facts[0].text_value, address);
  }
  const debtor = create(); guardCreditorAddress(debtor, [{ id: 's', text: `Wierzyciel: Bank Alfa. Adresat: Dłużnik. Adres: ${address}.` }], 'Bank Alfa');
  assert.equal(debtor.facts[0].type, 'unknown');
  const anonymous = create(); guardCreditorAddress(anonymous, [{ id: 's', text: `Adres: ${address}.` }], null);
  assert.equal(anonymous.facts[0].type, 'unknown');
});
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
test('negation and cropped principal quote cannot falsely certify no dispute', () => {
  for (const source of ['Nie uznaję długu.', 'Nie jest prawdą, że nie kwestionuję roszczenia.',
    'Nie kwestionuję należności głównej. Odmawiam jednak zapłaty odsetek.',
    'Nie kwestionuję roszczenia, ale kwestionuję koszty.']) {
    const fact = { field: 'disputed', type: 'boolean', boolean_value: false, source_id: 's', quote: source };
    guardClaimSemantics({ facts: [fact] }, [{ id: 's', text: source }]); assert.equal(fact.type, 'unknown', source);
  }
  const fact = { field: 'disputed', type: 'boolean', boolean_value: false, source_id: 's', quote: 'Nie kwestionuję roszczenia.' };
  guardClaimSemantics({ facts: [fact] }, [{ id: 's', text: fact.quote + ' Jednak kwestionuję odsetki.' }]);
  assert.equal(fact.type, 'unknown');
});
test('a transfer which did not happen is not evidence of a predecessor', () => {
  const fact = { field: 'original_creditor', type: 'text', text_value: 'Fundusz Test', quote: 'Fundusz Test' };
  guardClaimSemantics({ facts: [fact] }, [{ text: 'Rozważano cesję na Fundusz Test, jednak do cesji nie doszło.' }]);
  assert.equal(fact.type, 'unknown');
});

test('observed Anthropic response cannot turn missing security information into no security', () => {
  const quote = 'Informacja o zabezpieczeniu: brak danych.';
  const fact = { field: 'security_description', type: 'text', text_value: 'brak', boolean_value: null,
    minor_units: null, currency: null, as_of: null, precision: 'exact', source_id: 'S04-D01', quote };
  const flags = guardClaimSemantics({ facts: [fact] }, [{ id: 'S04-D01', text: quote }]);
  assert.equal(fact.type, 'unknown'); assert.equal(fact.text_value, null); assert.equal(fact.precision, 'unknown');
  assert.equal(fact.quote, quote); assert.equal(fact.source_id, 'S04-D01');
  assert.deepEqual(flags, [{ field: 'security_description', code: 'NO_SECURITY_INFORMATION' }]);
  const cropped = { ...fact, type: 'text', text_value: 'brak', precision: 'exact', quote: 'brak' };
  guardClaimSemantics({ facts: [cropped] }, [{ id: 'S04-D01', text: quote }]);
  assert.equal(cropped.type, 'unknown');
});

test('missing collateral details do not erase known security or explicit unsecured credit', () => {
  for (const quote of ['Zabezpieczenie: hipoteka. Brak danych o jej wartości.', 'Kredyt udzielono bez zabezpieczenia.']) {
    const fact = { field: 'security_description', type: 'text', text_value: quote, source_id: 'doc', quote };
    const flags = guardClaimSemantics({ facts: [fact] }, [{ id: 'doc', text: quote }]);
    assert.equal(fact.type, 'text'); assert.equal(flags.length, 0);
  }
});
