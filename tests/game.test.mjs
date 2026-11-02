import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluate} from '../js/evaluate.js';
import {Game} from '../js/game.js';
import {EngineOutcomeProvider} from '../js/outcomes.js';
const catalog=JSON.parse(readFileSync(new URL('../assets/math/rounds.json',import.meta.url)));

test('JavaScript independently agrees with every generated reveal',()=>{
 let reveals=0;
 for(const record of catalog.records)for(const event of record.events.filter(e=>e.type==='courtReveal')){
  const result=evaluate(event.grid,event.royals,event.momentum);
  assert.equal(result.rawUnits,event.rawUnits,`record ${record.id}`);reveals++;
 }
 assert.ok(reveals>13000);
});
test('actual integer weights give exact 92% including full features',()=>{
 let total=0n,returns=0n;
 for(const record of catalog.records){total+=BigInt(record.weight);returns+=BigInt(record.weight)*BigInt(record.payoutMultiplier);}
 assert.equal(total,1000000000n);assert.equal(returns*25n,total*100n*23n);
});
test('complete bonus uses one provider play and one settlement',async()=>{
 const record=catalog.records.find(r=>r.category==='bonus');let plays=0,finishes=0;
 const provider={balanceUnits:1e9,bets:[2e6],defaultBet:2e6,async initialize(){return null;},async play(){plays++;return structuredClone(record);},async finish(){finishes++;}};
 const game=new Game(provider);await game.initialize();let reveals=0;
 do{await game.spin();reveals++;}while(game.pending);
 assert.equal(plays,1);assert.equal(finishes,1);assert.ok(reveals>=9);assert.equal(game.roundTotal,record.payoutMultiplier);
});
test('RGS validation, authenticated bets, and no end-round on zero payout',async()=>{
 assert.throws(()=>new EngineOutcomeProvider(new URLSearchParams('rgs_url=http://example.com&sessionID=test')),/Invalid/);
 const record=catalog.records.find(r=>r.payoutMultiplier===0);const requests=[];
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  requests.push({url,body:JSON.parse(options.body)});
  const response=url.endsWith('/authenticate')?{balance:{amount:1e6,currency:'USD'},config:{minBet:100000,maxBet:1e6,stepBet:100000,defaultBetLevel:300000,betLevels:[300000,700000],jurisdiction:{}}}:{balance:{amount:700000,currency:'USD'},round:{active:false,amount:300000,payoutMultiplier:0,state:record.events}};
  return {ok:true,json:async()=>response};
 };
 try{
  const provider=new EngineOutcomeProvider(new URLSearchParams('rgs_url=example.com&sessionID=test'));
  await provider.initialize();assert.deepEqual(provider.bets,[300000,700000]);
  await provider.play(300000);await provider.finish();assert.equal(requests.length,2);assert.equal(requests[1].body.mode,'base');
  provider.balanceUnits=0;await assert.rejects(()=>provider.play(300000),/Insufficient/);assert.equal(requests.length,2);
 }finally{globalThis.fetch=original;}
});
test('active round resumes at its original stake without a new play request',async()=>{
 const record=catalog.records.find(r=>r.category==='bonus');let plays=0;
 const provider={balanceUnits:0,bets:[100000],defaultBet:100000,amount:700000,async initialize(){return structuredClone(record);},async play(){plays++;throw new Error('must not play');},async finish(){}};
 const game=new Game(provider);assert.equal(await game.initialize(),true);assert.equal(game.bet,700000);
 do{await game.spin();}while(game.pending);assert.equal(plays,0);
});
test('uncertain RGS play blocks retry rather than duplicating a debit',async()=>{
 const provider=new EngineOutcomeProvider(new URLSearchParams('rgs_url=example.com&sessionID=test'));
 provider.bets=[100000];provider.balanceUnits=1e6;const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('offline');};
 try{await assert.rejects(()=>provider.play(100000),/Connection interrupted/);await assert.rejects(()=>provider.play(100000),/Reload/);assert.equal(calls,1);}
 finally{globalThis.fetch=original;}
});
test('positive Engine round settles once and displays only returned wallet balance',async()=>{
 const record=catalog.records.find(r=>r.payoutMultiplier>0&&r.category!=='bonus');let calls=[];
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  calls.push(url);
  const body=url.endsWith('/play')?{balance:{amount:900000,currency:'USD'},round:{active:true,amount:100000,payoutMultiplier:record.payoutMultiplier/100,state:record.events}}:{balance:{amount:1234567,currency:'USD'}};
  return {ok:true,json:async()=>body};
 };
 try{
  const provider=new EngineOutcomeProvider(new URLSearchParams('rgs_url=example.com&sessionID=test'));provider.bets=[100000];provider.balanceUnits=1e6;
  await provider.play(100000);assert.equal(provider.balanceUnits,900000);await provider.finish();assert.equal(provider.balanceUnits,1234567);assert.equal(calls.length,2);assert.ok(calls[1].endsWith('/wallet/end-round'));
 }finally{globalThis.fetch=original;}
});
