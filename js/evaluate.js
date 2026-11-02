import {MODEL} from './model.js';
// Verification/visualization only. Engine outcomes and balances remain authoritative.
export function evaluate(grid,royals={},momentum=1){
 const wins=[];
 MODEL.lines.forEach((line,index)=>{
  const sequence=line.map((row,col)=>grid[col][row]);
  const candidates=[];
  for(const symbol of MODEL.symbols.filter(s=>s.pays)){
   let length=0;
   if(symbol.id==='wild')length=sequence.every(s=>s==='wild'||s==='royal')?6:0;
   else{
    for(const id of sequence){if(![symbol.id,'wild','royal'].includes(id))break;length++;}
    if(!sequence.slice(0,length).includes(symbol.id))length=0;
   }
   if(length<3)continue;
   const multiplier=Array.from({length},(_,c)=>Number(royals[c]||0)).reduce((a,b)=>a+b,0)||1;
   const units=symbol.pays[length-3]*multiplier*momentum;
   if(units)candidates.push({line:index,length,symbol:symbol.id,units,royalMultiplier:multiplier});
  }
  candidates.sort((a,b)=>b.units-a.units||b.length-a.length||b.symbol.localeCompare(a.symbol));
  if(candidates.length)wins.push(candidates[0]);
 });
 return {rawUnits:wins.reduce((sum,w)=>sum+w.units,0),lineWins:wins};
}
