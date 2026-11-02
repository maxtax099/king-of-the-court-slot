import {CONFIG,ART,MODEL} from './config.js';
import {DemoOutcomeProvider,EngineOutcomeProvider,API_SCALE} from './outcomes.js';
import {Game} from './game.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
let game,provider,spinning=false,auto=false,autoRemaining=0,autoGeneration=0,turbo=false,sound=false,audio,bannerTimer;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const symbols=Object.fromEntries(MODEL.symbols.map(s=>[s.id,s]));
function format(units){
 const amount=units/API_SCALE,currency=provider?.currency||'DEMO';
 // Preserve visible sub-cent server payouts to the API's six-digit precision.
 const decimals=Number.isInteger(units/10000)?2:Math.min(6,Math.max(2,String(amount).split('.')[1]?.length||2));
 if(currency==='DEMO')return amount.toFixed(decimals);
 if(['XGC','XSC'].includes(currency))return `${amount.toFixed(decimals)} ${currency==='XGC'?'GC':'SC'}`;
 const suffix=['DKK','PLN','VND','CLP','ARS'].includes(currency);
 const symbols={USD:'$',CAD:'CA$',JPY:'¥',EUR:'€',RUB:'₽',CNY:'CN¥',PHP:'₱',INR:'₹',IDR:'Rp',KRW:'₩',BRL:'R$',MXN:'MX$',DKK:'KR',PLN:'zł',VND:'₫',TRY:'₺',CLP:'CLP',ARS:'ARS',PEN:'S/'};
 const zero=['JPY','IDR','KRW','VND','CLP'].includes(currency);
 const places=zero&&Number.isInteger(amount)?0:decimals;
 const value=amount.toFixed(places),symbol=symbols[currency]||currency;
 return suffix||!symbols[currency]?`${value} ${symbol}`:`${symbol}${value}`;
}
function art(id){const span=document.createElement('span');span.className='symbol-art';span.style.backgroundPosition=`${ART[id].x*100/3}% ${ART[id].y*50}%`;span.setAttribute('aria-hidden','true');return span;}
function render(grid,winners=[],royals={}){
 $('grid').replaceChildren(...grid.map((reel,col)=>{
  const column=document.createElement('div');column.className='reel';
  reel.forEach((id,row)=>{
   const cell=document.createElement('div');cell.className=`symbol ${id} ${winners.includes(`${col}-${row}`)?'winner':''}`;
   cell.setAttribute('aria-label',symbols[id].label);cell.append(art(id));column.append(cell);
  });
  if(royals[col]){
   column.classList.add('royal-reel');const overlay=document.createElement('div');overlay.className='royal-overlay';
   overlay.append(art('king'));const name=document.createElement('small');name.textContent='ROYAL WILD';const multiplier=document.createElement('strong');multiplier.textContent=`${royals[col]}×`;
   overlay.append(name,multiplier);column.append(overlay);
  }
  return column;
 }));
}
function stopAuto(){auto=false;autoRemaining=0;autoGeneration++;$('auto').textContent='AUTO';$('auto').setAttribute('aria-pressed','false');}
function refresh(win=0){
 if(!game)return;
 $('balance').textContent=format(game.balance);$('bet').textContent=format(game.bet||0);$('win').textContent=format(win);
 $('bonus').textContent=game.freeSpins?`${game.freeSpins} FREE · MOMENTUM ${game.multiplier}× · METER ${game.meter}/4`:'6 REELS · 19 LINES';
 $('bonus-total').textContent=game.freeSpins?`FEATURE TOTAL ${format(game.bonusTotal)}`:'THE ARENA IS YOURS';
 document.body.classList.toggle('bonus-active',game.freeSpins>0);
 $('spin').disabled=spinning||!game.ready||game.failed;
 $('plus').disabled=$('minus').disabled=spinning||game.pending||game.failed;
 $('auto').disabled=!!provider.jurisdiction.disabledAutoplay||game.failed;
 $('turbo').disabled=!!provider.jurisdiction.disabledTurbo;
 $('demo-bonus').hidden=!provider.isDemo;
 $('demo-bonus').disabled=spinning||game.pending;
}
function celebrate(text){clearTimeout(bannerTimer);$('celebration').textContent=text;$('celebration').classList.add('show');bannerTimer=setTimeout(()=>$('celebration').classList.remove('show'),1800);}
function tone(win){
 if(!sound)return;
 try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();
 const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);
 oscillator.frequency.value=win?660:180;gain.gain.setValueAtTime(0.04,audio.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,audio.currentTime+0.2);oscillator.start();oscillator.stop(audio.currentTime+0.2);
 }catch{sound=false;$('sound').textContent='♪ OFF';$('sound').setAttribute('aria-pressed','false');}
}
async function spin(){
 if(!game?.ready||spinning||document.querySelector('dialog[open]')||game.failed)return;
 const continuing=game.pending;
 spinning=true;refresh();$('status').textContent=continuing?'THE REIGN CONTINUES…':'TAKE YOUR SHOT…';$('grid').classList.add('spinning');
 let win=0;
 try{
  const result=await game.spin();await wait(turbo?CONFIG.animation.turbo:CONFIG.animation.normal);
  $('grid').classList.remove('spinning');render(result.grid,result.winningCells,result.royals);win=result.win;tone(win>0);
  $('status').textContent=win?`SCORE ${format(win)}${result.isBonus?` · MOMENTUM ${result.momentum}×`:''}`:'NEXT SHOT. NEW GLORY.';
  if(result.triggered)celebrate(`♛ ${game.freeSpins} FREE SPINS`);
  else if(result.bonusEnded)celebrate(`REIGN COMPLETE · ${format(game.bonusTotal)}`);
  else if(result.extraSpins)celebrate(`+${result.extraSpins} FREE SPINS · ROYAL METER`);
  else if(win>=game.stake*10)celebrate(`${win>=game.stake*25?'MEGA':'BIG'} WIN · ${format(win)}`);
  refresh(win);
  if(auto&&!continuing){autoRemaining--;if(autoRemaining<=0)stopAuto();}
 }catch(error){$('status').textContent=error.message;stopAuto();}
 finally{spinning=false;$('grid').classList.remove('spinning');refresh(win);}
 // Free-spin reveals belong to one paid server round; no additional wallet plays.
 if(game.pending&&!game.failed&&!document.hidden){await wait(turbo?100:900);if(!document.querySelector('dialog[open]'))spin();}
 else if(auto&&!game.failed){const generation=autoGeneration;await wait(turbo?100:800);if(auto&&generation===autoGeneration&&!document.hidden)spin();}
}
$('spin').onclick=spin;
for(const [id,delta] of [['minus',-1],['plus',1]])$(id).onclick=()=>{if(!game||spinning||game.pending)return;game.betIndex=Math.max(0,Math.min(provider.bets.length-1,game.betIndex+delta));refresh();};
$('auto').onclick=()=>{if(auto){stopAuto();return;}if(!game?.ready||spinning||provider.jurisdiction.disabledAutoplay)return;$('autoplay-dialog').showModal();};
$('cancel-auto').onclick=()=>$('autoplay-dialog').close();
$('confirm-auto').onclick=()=>{$('autoplay-dialog').close();auto=true;autoRemaining=10;autoGeneration++;$('auto').textContent='STOP AUTO';$('auto').setAttribute('aria-pressed','true');spin();};
$('turbo').onclick=()=>{if(provider?.jurisdiction.disabledTurbo)return;turbo=!turbo;$('turbo').setAttribute('aria-pressed',String(turbo));};
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'♪ ON':'♪ OFF';$('sound').setAttribute('aria-pressed',String(sound));tone(true);};
$('info').onclick=()=>{stopAuto();$('paytable').showModal();};
$('close-info').onclick=()=>$('paytable').close();
$('demo-bonus').onclick=()=>{if(!provider.isDemo||spinning||game.pending)return;stopAuto();provider.previewBonus=true;$('paytable').close();$('status').textContent='UNWEIGHTED FEATURE PREVIEW · RTP DOES NOT APPLY';spin();};
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAuto();if(audio)audio.suspend();}});
document.addEventListener('keydown',event=>{
 if(event.code!=='Space'||event.repeat||event.altKey||event.ctrlKey||event.metaKey||provider?.jurisdiction.disabledSpacebar)return;
 if(document.querySelector('dialog[open]')||event.target.closest('button,input,textarea,select,a,[contenteditable]'))return;
 event.preventDefault();if(!auto)spin();
});
function rules(){
 $('payouts').replaceChildren(...MODEL.symbols.filter(s=>s.pays).map(symbol=>{
  const card=document.createElement('div');card.className='paycard';card.append(art(symbol.id));
  const label=document.createElement('strong');label.textContent=symbol.label;card.append(label);
  const table=document.createElement('div');table.textContent=symbol.pays.map((p,i)=>`${i+3}: ${p/100}×`).join(' · ');card.append(table);return card;
 }));
 $('line-diagrams').innerHTML=MODEL.lines.map((line,index)=>`<figure><svg viewBox="0 0 120 100" aria-label="Line ${index+1}">${Array.from({length:30},(_,i)=>{const col=i%6,row=Math.floor(i/6);return `<rect x="${col*20}" y="${row*20}" width="19" height="19" fill="${line[col]===row?'#e9bd69':'#302139'}"/>`;}).join('')}</svg><figcaption>${index+1}</figcaption></figure>`).join('');
}
render([['A','king','ring','shoe','Q'],['crown','ball','K','J','A'],['wild','king','Q','ring','shoe'],['shoe','ball','jersey','A','crown'],['J','scatter','crown','K','ring'],['ball','jersey','A','king','wild']]);rules();
try{
 // Replay is deliberately blocked until its separate official launch flow is implemented.
 if(params.get('replay')==='true')throw new Error('Replay integration is not implemented in this build.');
 provider=params.has('rgs_url')||params.has('sessionID')?new EngineOutcomeProvider(params):new DemoOutcomeProvider();
 game=new Game(provider);const restored=await game.initialize();
 $('demo-label').textContent=provider.isDemo?'LOCAL PREVIEW · DEMO CREDITS':'ENGINE SESSION · ENGLISH';
 $('status').textContent=restored?'ACTIVE ROUND RESTORED · PRESS SPIN TO CONTINUE':'READY · 92% MATHEMATICAL RTP';
 refresh();
}catch(error){$('status').textContent=error.message;$('spin').disabled=true;for(const id of ['auto','minus','plus','demo-bonus'])$(id).disabled=true;}
