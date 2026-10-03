import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Application } from '../src/app/application.mjs';
import { currentFacts, publicCase } from '../src/app/domain.mjs';
import { converse, validateConversation, guardConversationMoney } from '../src/ai/conversation.mjs';

const env = { OPENAI_API_KEY: 'test-not-live', ANTHROPIC_API_KEY: 'test-not-live', DEEPSEEK_API_KEY: 'test-not-live' };
const actor = { id: 'lawyer', name: 'Test', tenant: 'tenant', role: 'lawyer' };
test('conversation rejects a computed total absent from the quotation, while preserving explicit amounts', () => {
  const result = { reply:'Zapisuję dane.', warnings:[], facts:[{field:'declared_total',type:'money',minor_units:4800000,currency:'PLN',quote:'bank około 40 tysięcy złotych i siostra 8 tysięcy złotych'},
    {field:'monthly_income',type:'money',minor_units:275050,currency:'PLN',quote:'Dochód 2 750,50 zł'},
    {field:'monthly_expenses',type:'money',minor_units:250000,currency:'PLN',quote:'Koszty 2,5 tys. zł'}] };
  assert.deepEqual(guardConversationMoney(result),['declared_total']); assert.equal(result.facts.length,2);
  assert.match(result.reply,/nie trafiła do ustaleń/);
});
const fact = (field, source, value) => ({ field, type: value === null ? 'unknown' : 'text', text_value: value,
  boolean_value: null, minor_units: null, currency: null, as_of: null, precision: value === null ? 'unknown' : 'exact',
  source_id: source.id, quote: source.text });
function setup(t, handler) {
  const directory = mkdtempSync(resolve(tmpdir(), 'casecheck-conversation-'));
  const app = new Application({ stateDir: directory, env, conversation: handler });
  t.after(() => { app.close(); rmSync(directory, { recursive: true, force: true }); });
  let state = app.create(actor, { title: 'Rozmowa testowa', track: 'consumer', synthetic: true });
  state = app.consent(actor, state.id, { revision: state.revision, accepted: true, provider: 'deepseek' });
  return { app, directory, state };
}
const reply = task => ({ output: { reply: 'Rozumiem. W jakiej miejscowości mieszkasz?', next_field: 'address',
  facts: [fact('client_name', task.sources[0], 'Jan Testowy')], warnings: [] }, metadata: { model: 'test-double' } });

test('conversation uses history, returns the supplied model reply and sparse cited updates without a form field', async t => {
  const calls = [];
  const f = setup(t, async ({ task }) => { calls.push(task); return calls.length === 1 ? reply(task) : {
    output: { reply: 'Możemy wrócić do adresu później. Co spowodowało trudności?', next_field: 'causes',
      facts: [fact('address', task.sources[0], null)], warnings: [] } }; });
  let state = await f.app.assistantMessage(actor, f.state.id, { revision: f.state.revision, text: 'Jestem Jan Testowy.' });
  assert.equal(state.messages.at(-1).text, 'Rozumiem. W jakiej miejscowości mieszkasz?');
  assert.equal(currentFacts(state).client_name.text_value, 'Jan Testowy'); assert.equal(currentFacts(state).client_name.review, 'pending');
  assert.equal(state.jobs[0].kind, 'conversation'); assert.equal(f.app.store.budget().used, 1);
  state = await f.app.assistantMessage(actor, state.id, { revision: state.revision, text: 'Nie wiem, nie mam teraz stałego adresu.' });
  assert.equal(calls[1].history.at(-1).text, 'Rozumiem. W jakiej miejscowości mieszkasz?');
  assert.equal(calls[1].known_facts[0].text_value, 'Jan Testowy');
  assert.equal(currentFacts(state).address.type, 'unknown'); assert.equal(state.messages.at(-1).next_field, 'causes');
  assert.equal(f.app.store.budget().used, 2);
});

test('missing consent and exhausted budget do not save a duplicate message or call the model', async t => {
  let count = 0; const f = setup(t, async args => { count++; return reply(args.task); });
  const unconsented = f.app.create(actor, { title: 'Bez zgody', track: 'consumer', synthetic: true });
  await assert.rejects(f.app.assistantMessage(actor, unconsented.id, { revision: 1, text: 'Dzień dobry' }), { code: 'CONVERSATION_CONSENT_REQUIRED' });
  for (let i = 0; i < 20; i++) f.app.store.reserve();
  await assert.rejects(f.app.assistantMessage(actor, f.state.id, { revision: f.state.revision, text: 'Dzień dobry' }), { code: 'DAILY_LIMIT' });
  assert.equal(count, 0); assert.equal(f.app.store.get(actor, f.state.id).messages.length, 0);
});

test('private document facts and foreign cases never enter the conversational context or client sidebar', async t => {
  let captured; const f = setup(t, async ({ task }) => { captured = task; return { output: { reply: 'Jak mogę pomóc?', next_field: null, facts: [], warnings: [] } }; });
  let state = await f.app.upload(actor, f.state.id, f.state.revision, Buffer.from('Tajna informacja prawnika'), 'prywatne.txt');
  const source = state.sources.at(-1);
  state = f.app.store.update(actor, state.id, state.revision, 'test-private-fact', s => s.facts.push({ ...fact('assets', source, 'Tajna informacja prawnika'), current: true, review: 'confirmed' }));
  const client = { id: 'client', tenant: actor.tenant, role: 'client', case_id: state.id };
  assert.equal(publicCase(state, client).conversation_facts.length, 0);
  await f.app.assistantMessage(client, state.id, { revision: state.revision, text: 'Dzień dobry' });
  assert.doesNotMatch(JSON.stringify(captured), /Tajna|prywatne/);
  await assert.rejects(f.app.assistantMessage({ ...client, tenant: 'foreign' }, state.id, { revision: state.revision, text: 'Dzień dobry' }), { code: 'NOT_FOUND' });
});

test('malformed reply or invented citation fails closed, consumes one reservation and does not retry', async t => {
  let count = 0; const f = setup(t, async ({ task }) => { count++; const result = reply(task); result.output.facts[0].quote = 'Nieistniejący cytat'; return result; });
  const state = await f.app.assistantMessage(actor, f.state.id, { revision: f.state.revision, text: 'Jestem Jan Testowy' });
  assert.equal(state.jobs[0].status, 'failed'); assert.equal(state.facts.length, 0); assert.equal(count, 1);
  assert.equal(state.messages.at(-1).kind, 'service_notice'); assert.equal(f.app.store.budget().used, 1);
});

test('saved conversation result recovers reply and facts once, without a second API call', async t => {
  let count = 0; const f = setup(t, async ({ task }) => { count++; return reply(task); });
  const original = f.app.finishSavedJob.bind(f.app); f.app.finishSavedJob = () => { throw new Error('simulated write failure'); };
  await assert.rejects(f.app.assistantMessage(actor, f.state.id, { revision: f.state.revision, text: 'Jestem Jan Testowy' }), { code: 'RESULT_SAVED_RECOVERY_REQUIRED' });
  let state = f.app.store.get(actor, f.state.id); assert.equal(state.messages.length, 1); assert.equal(state.facts.length, 0);
  f.app.finishSavedJob = original;
  state = f.app.recoverJob(actor, state.id, { revision: state.revision, job_id: state.jobs[0].id });
  state = f.app.recoverJob(actor, state.id, { revision: state.revision, job_id: state.jobs[0].id });
  assert.equal(state.messages.length, 2); assert.equal(state.facts.length, 1); assert.equal(count, 1); assert.equal(f.app.store.budget().used, 1);
});

test('stale conversation result cannot overwrite a newer client statement', async t => {
  let f;
  f = setup(t, async ({ task }) => {
    const state = f.app.store.get(actor, f.state.id);
    f.app.message(actor, state.id, { revision: state.revision, text: 'Sprostowanie: nie Jan, tylko Adam Testowy.' });
    return reply(task);
  });
  const state = await f.app.assistantMessage(actor, f.state.id, { revision: f.state.revision, text: 'Jestem Jan Testowy' });
  assert.equal(state.jobs[0].status, 'discarded'); assert.equal(state.facts.length, 0); assert.equal(state.messages.length, 2);
});

test('the DeepSeek request contract carry the conversational schema and validate the result', async () => {
  const task = { sources: [{id:'latest',kind:'message',text:'Jestem Jan Testowy'}], track:'consumer',
    allowed_fields:[{key:'client_name',type:'text'}], known_facts:[], deferred_fields:[], history:[] };
  const output = { reply:'Co spowodowało trudności?', next_field:null, facts:[fact('client_name',task.sources[0],'Jan Testowy')], warnings:[] };
  for (const provider of ['deepseek']) {
    let request;
    const result = await converse({provider,task,env,fetchImpl:async (url, options)=>{
      request=JSON.parse(options.body);
      const body=provider==='openai'?{status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]}:
        provider==='anthropic'?{stop_reason:'tool_use',content:[{type:'tool_use',name:'emit_case_facts',input:output}]}:
        {choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]};
      return new Response(JSON.stringify(body),{status:200});
    }});
    assert.equal(result.output.reply,output.reply); assert.doesNotMatch(JSON.stringify(request),/test-not-live/);
    assert.match(JSON.stringify(request),/reply/); assert.match(JSON.stringify(request),/next_field/);
    assert.match(JSON.stringify(request),/Nie jesteś wyłącznie ekstraktorem/);
  }
  assert.throws(()=>validateConversation({...output,facts:[{...output.facts[0],field:'bank_password'}]},task));
  assert.throws(()=>validateConversation({...output,next_field:'foreign_field'},task));
});
