import {MODEL} from './model.js';
export {MODEL};
// IDs are shared by published math events and the original artwork atlas.
export const ART=Object.fromEntries(['king','crown','ring','ball','shoe','jersey','A','K','Q','J','wild','scatter'].map((id,i)=>[id,{x:i%4,y:Math.floor(i/4)}]));
ART.royal=ART.king;
export const CONFIG={grid:{columns:6,rows:5},bets:[200000,500000,1000000,2000000,5000000,10000000,20000000],defaultBetIndex:3,initialBalance:1000000000,animation:{normal:650,turbo:100},symbols:MODEL.symbols};
