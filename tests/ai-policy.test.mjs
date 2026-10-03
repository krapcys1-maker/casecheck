import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Spend, fetchAI } from '../src/ai/spend.mjs';
import { providerConfig, extractFacts } from '../src/ai/extraction.mjs';
import { converse } from '../src/ai/conversation.mjs';
import { saveFile, ocrDocument, ocrImages } from '../src/app/files.mjs';
import PDFDocument from 'pdfkit';

test('other providers and model overrides are blocked despite configured keys, before any request', async () => {
  const env = { OPENAI_API_KEY:'fake', ANTHROPIC_API_KEY:'fake', DEEPSEEK_API_KEY:'fake' };
  let calls=0; const fetchImpl=async()=>{ calls++; throw new Error('unexpected'); };
  for(const provider of ['openai','anthropic']) {
    assert.throws(()=>providerConfig(provider,env),{code:'PROVIDER_DISABLED'});
    await assert.rejects(extractFacts({provider,env,sources:[{id:'s',text:'Dane'}],requested_fields:['name'],fetchImpl}),{code:'PROVIDER_DISABLED'});
  }
  assert.throws(()=>providerConfig('deepseek',{...env,DEEPSEEK_MODEL:'deepseek-v4-pro'}),{code:'MODEL_DISABLED'});
  await assert.rejects(fetchAI('https://api.openai.com/v1/responses',{body:'{}'},env,fetchImpl),{code:'PROVIDER_DISABLED'});
  assert.equal(calls,0);
});

test('dollar reservations survive restart, failures and concurrent connections; day never resets money', t => {
  const dir=mkdtempSync(join(tmpdir(),'casecheck-spend-'));
  const env={CASECHECK_AI_BUDGET_PATH:join(dir,'budget.sqlite'),CASECHECK_AI_USD_LIMIT:'0.01'};
  const a=new Spend(env), b=new Spend(env); t.after(()=>{a.close();b.close();rmSync(dir,{recursive:true,force:true});});
  const body={model:'deepseek-flash',max_tokens:4000,messages:[{role:'user',content:'Test'}]};
  const id=a.reserve(body); assert.ok(b.state().accounted_usd>0.007);
  assert.throws(()=>b.reserve(body),{code:'AI_COST_LIMIT'});
  a.settle(id,{prompt_tokens:1000,completion_tokens:100}); assert.equal(b.state().accounted_usd,0.00042);
  a.settle(id,{prompt_tokens:0,completion_tokens:0}); assert.equal(b.state().accounted_usd,0.00042);
  b.reserve(body); const restarted=new Spend(env); assert.equal(restarted.state().accounted_usd,b.state().accounted_usd); restarted.close();
});

test('PDF OCR renders ordered page images and calls only DeepSeek with bounded JSON output', async t => {
  const dir=mkdtempSync(join(tmpdir(),'casecheck-ocr-deepseek-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const pdf=new PDFDocument();const chunks=[];pdf.on('data',p=>chunks.push(p));
  const done=new Promise(r=>pdf.on('end',r));pdf.text('Page one: 1234.56 PLN');pdf.addPage().text('Page two: balance date 2026-09-30');pdf.end();await done;
  const file=saveFile(dir,Buffer.concat(chunks),'synthetic.pdf');file.pages=2;
  const images=await ocrImages(dir,file);assert.equal(images.length,2);assert.ok(images.every(p=>p.startsWith('data:image/png;base64,')));assert.notEqual(images[0],images[1]);
  let calls=0;
  const result=await ocrDocument(dir,file,{DEEPSEEK_API_KEY:'fake'},async(url,options)=>{
    calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');const body=JSON.parse(options.body);
    assert.equal(body.model,'deepseek-flash');assert.equal(body.max_tokens,6000);assert.equal(body.messages[1].content.filter(p=>p.type==='image_url').length,2);
    return new Response(JSON.stringify({model:'deepseek-flash',choices:[{finish_reason:'stop',message:{content:JSON.stringify({pages:[{page:1,text:'Page one'},{page:2,text:'Page two'}]})}}]}));
  });
  assert.equal(calls,1);assert.equal(result.pages.length,2);
});
