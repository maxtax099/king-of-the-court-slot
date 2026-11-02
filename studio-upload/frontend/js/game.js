import {MODEL} from './model.js';
import {payoutAmount} from './outcomes.js';
export class Game{
 constructor(provider){this.provider=provider;this.queue=[];this.betIndex=0;this.stake=0;this.freeSpins=0;this.multiplier=1;this.meter=0;this.bonusTotal=0;this.roundTotal=0;this.busy=false;this.ready=false;this.failed=false;}
 get balance(){return this.provider.balanceUnits;}
 get bet(){return this.queue.length?this.stake:this.provider.bets[this.betIndex];}
 get pending(){return this.queue.some(e=>e.type==='courtReveal');}
 validate(book){
  if(!Array.isArray(book.events)||!book.events.length)throw new Error('Empty event book');
  let sum=0;
  for(const event of book.events){
   if(event.modelVersion!==MODEL.version)throw new Error('Math/frontend version mismatch. Upload matching versions.');
   if(!['courtReveal','courtBonusStart','courtBonusEnd'].includes(event.type))throw new Error('Unknown math event');
   if(event.type!=='courtReveal')continue;
   if(event.grid?.length!==6||event.grid.some(reel=>reel.length!==5||reel.some(id=>!MODEL.symbols.some(s=>s.id===id))))throw new Error('Invalid math board');
   if(!Number.isSafeInteger(event.winUnits)||event.winUnits<0)throw new Error('Invalid event payout');
   sum+=event.winUnits;if(event.totalUnits!==sum)throw new Error('Inconsistent event totals');
  }
  if(sum!==book.payoutMultiplier||sum>MODEL.maxWinUnits)throw new Error('Invalid round payout');
 }
 async initialize(){
  const restored=await this.provider.initialize();
  this.betIndex=Math.max(0,this.provider.bets.indexOf(this.provider.defaultBet));
  if(restored){this.validate(restored);this.queue=restored.events;this.stake=this.provider.amount;}
  this.ready=true;return Boolean(restored);
 }
 async spin(){
  if(!this.ready||this.failed)throw new Error('Reload to reconnect before playing');
  if(this.busy)throw new Error('Round already in progress');
  this.busy=true;
  try{
   if(!this.pending){
    this.stake=this.bet;const book=await this.provider.play(this.stake);this.validate(book);
    this.queue=book.events;this.roundTotal=0;this.bonusTotal=0;this.multiplier=1;this.meter=0;
   }
   let event;
   while(this.queue.length){event=this.queue.shift();if(event.type==='courtReveal')break;}
   if(event?.type!=='courtReveal')throw new Error('Missing reveal');
   const win=payoutAmount(this.stake,event.winUnits);
   this.roundTotal=event.totalUnits;
   if(event.kind==='free'){this.freeSpins=event.remaining;this.multiplier=event.nextMomentum;this.meter=event.meter;this.bonusTotal+=win;}
   let triggered=false,bonusEnded=false;
   while(this.queue.length&&this.queue[0].type!=='courtReveal'){
    const marker=this.queue.shift();
    if(marker.type==='courtBonusStart'){triggered=true;this.freeSpins=marker.spins;this.multiplier=1;this.bonusTotal=0;}
    if(marker.type==='courtBonusEnd'){bonusEnded=true;this.freeSpins=0;}
   }
   const winners=new Set();
   for(const line of event.lineWins)for(let c=0;c<line.length;c++)winners.add(`${c}-${MODEL.lines[line.line][c]}`);
   if(!this.pending)await this.provider.finish();
   return {...event,win,winningCells:[...winners],triggered,bonusEnded,isBonus:event.kind==='free'};
  }catch(error){if(this.provider.blocked)this.failed=true;throw error;}
  finally{this.busy=false;}
 }
}
