import {CONFIG,MODEL} from './config.js';
export const API_SCALE=1_000_000;
export const payoutAmount=(stake,units)=>Number(BigInt(stake)*BigInt(units)/100n);
function integer(value,label){if(!Number.isSafeInteger(value)||value<0)throw new Error(`Invalid ${label}`);return value;}

// Local developer preview only. This samples the SAME weighted complete-round
// library as the published math; it is not a production game server or wallet.
export class DemoOutcomeProvider{
 constructor(){this.balanceUnits=CONFIG.initialBalance;this.currency='DEMO';this.bets=CONFIG.bets;this.defaultBet=2000000;this.jurisdiction={};this.isDemo=true;}
 async initialize(){
  if(!this.catalog){const response=await fetch('assets/math/rounds.json');if(!response.ok)throw new Error('Cannot load local math library');this.catalog=await response.json();}
  return null;
 }
 pick(records,total){
  // Unbiased integer ticket sampling. Never use this as a production RGS.
  const limit=Math.floor(4294967296/total)*total;let value;
  do{value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=limit);
  let ticket=value%total;
  return records.find(record=>(ticket-=record.weight)<0);
 }
 async play(amount){
  if(this.balanceUnits<amount&&!this.previewBonus)throw new Error('Not enough demo credits');
  let record;
  if(this.previewBonus){const records=this.catalog.records.filter(r=>r.category==='bonus');record=records[crypto.getRandomValues(new Uint32Array(1))[0]%records.length];this.previewBonus=false;}
  else{record=this.pick(this.catalog.records,this.catalog.totalWeight);this.balanceUnits-=amount;}
  this.amount=amount;this.current=record;
  return structuredClone(record);
 }
 async finish(){this.balanceUnits+=payoutAmount(this.amount,this.current.payoutMultiplier);this.current=null;}
}

// Contracts: official StakeEngine/math-sdk docs/rgs_docs/RGS.md and web-sdk
// packages/rgs-fetcher/src/schema.ts, pinned in math/SOURCES.md.
export class EngineOutcomeProvider{
 constructor(search){
  this.isDemo=false;this.currency='';this.balanceUnits=0;this.bets=[];this.jurisdiction={};this.blocked=false;
  this.sessionID=search.get('sessionID');
  if(!this.sessionID)throw new Error('Missing Engine sessionID');
  const raw=search.get('rgs_url');
  if(!raw)throw new Error('Missing Engine rgs_url');
  const url=new URL(raw.includes('://')?raw:`https://${raw}`);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Invalid Engine rgs_url; an HTTPS host is required');
  this.origin=url.origin;
 }
 async request(path,extra={}){
  let response;
  try{response=await fetch(this.origin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionID:this.sessionID,...extra}),signal:AbortSignal.timeout(20000)});}
  catch{this.blocked=true;throw new Error('Connection interrupted. Reload to restore the round; do not place another play.');}
  const data=await response.json();
  if(!response.ok||data.error||(data.statusCode&&data.statusCode!=='SUCCESS')){
   this.blocked=true;throw new Error('Engine request failed. Reload to reconnect.');
  }
  return data;
 }
 readBalance(balance){this.balanceUnits=integer(balance?.amount,'wallet balance');if(typeof balance.currency!=='string')throw new Error('Missing wallet currency');this.currency=balance.currency;}
 decode(round){
  if(!Array.isArray(round?.state)||!round.state.length)throw new Error('No compatible math events returned. Publish matching frontend and math versions.');
  const events=round.state;
  const reveals=events.filter(e=>e.type==='courtReveal');
  if(!reveals.length)throw new Error('Unsupported game event version');
  const units=reveals.at(-1).totalUnits;
  if(!Number.isFinite(round.payoutMultiplier)||round.payoutMultiplier<0)throw new Error('Missing server payout multiplier');
  if(Math.abs(round.payoutMultiplier*100-units)>0.001)throw new Error('Server round payout does not match the event book');
  this.round=round;
  return {events,payoutMultiplier:units,id:round.roundID};
 }
 async initialize(){
  const data=await this.request('/wallet/authenticate');this.readBalance(data.balance);
  const config=data.config;if(!config)throw new Error('Missing authenticated game configuration');
  this.jurisdiction=config.jurisdiction||{};
  this.bets=[...new Set((config.betLevels||[]).filter(x=>Number.isSafeInteger(x)&&x>0&&x>=config.minBet&&x<=config.maxBet&&x%config.stepBet===0))].sort((a,b)=>a-b);
  if(!this.bets.length)throw new Error('No valid authenticated bet levels');
  this.defaultBet=this.bets.includes(config.defaultBetLevel)?config.defaultBetLevel:this.bets[0];
  if(data.round?.active){this.amount=integer(data.round.amount,'restored stake');if(!this.amount)throw new Error('Invalid restored stake');return this.decode(data.round);}
  return null;
 }
 async play(amount){
  if(this.blocked)throw new Error('Reload to restore the Engine session');
  if(this.round?.active)throw new Error('Finish the active round first');
  if(!this.bets.includes(amount))throw new Error('Unsupported stake');
  if(this.balanceUnits<amount)throw new Error('Insufficient balance');
  this.blocked=true; // Never retry an uncertain debit automatically.
  const data=await this.request('/wallet/play',{amount,mode:MODEL.mode});
  this.readBalance(data.balance);this.amount=amount;
  const book=this.decode(data.round);this.blocked=false;return book;
 }
 async finish(){
  // Official SDK no-win path sends no end-round wallet call.
  if(this.round?.payoutMultiplier>0){
   this.blocked=true;const data=await this.request('/wallet/end-round');this.readBalance(data.balance);this.blocked=false;
  }
  this.round=null;
 }
}
