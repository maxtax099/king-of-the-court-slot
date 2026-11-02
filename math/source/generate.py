"""Build original finite weighted round books, not independent-reel casino math.

Every sampled outcome is a COMPLETE paid round, including all free spins.
Integer lookup weights are calibrated by exact arithmetic to 23/25 RTP.
The publish format follows StakeEngine/math-sdk docs/rgs_docs/data_format.md.
"""
import json, random, csv, hashlib, math
from pathlib import Path
from fractions import Fraction
import zstandard as zstd
ROOT=Path(__file__).resolve().parents[2]
MODEL=json.loads((ROOT/'math/source/model.json').read_text())
PAYS={s['id']:s['pays'] for s in MODEL['symbols'] if 'pays' in s}
REGULAR=[s for s in PAYS if s!='wild']
CAP=MODEL['maxWinUnits']; LINES=MODEL['lines']; rng=random.Random(9200619)

def evaluate(grid,royals,momentum=1):
    wins=[]
    for index,line in enumerate(LINES):
        seq=[grid[c][r] for c,r in enumerate(line)]
        options=[]
        for symbol,table in PAYS.items():
            if symbol=='wild':
                length=6 if all(x in ('wild','royal') for x in seq) else 0
            else:
                length=0
                for item in seq:
                    if item not in (symbol,'wild','royal'): break
                    length+=1
                if symbol not in seq[:length]: length=0
            if length<3: continue
            multiplier=sum(royals.get(str(c),0) for c in range(length)) or 1
            amount=table[length-3]*multiplier*momentum
            if amount: options.append((amount,length,symbol,multiplier))
        if options:
            amount,length,symbol,multiplier=max(options)
            wins.append({'line':index,'length':length,'symbol':symbol,'units':amount,'royalMultiplier':multiplier})
    return sum(x['units'] for x in wins),wins

def board():
    return [[rng.choice(REGULAR) for _ in range(5)] for _ in range(6)]

def apply_royals(grid,royals):
    for col in royals: grid[int(col)]=['royal']*5

def reveal(grid,royals,kind,momentum,total,**extra):
    raw,wins=evaluate(grid,royals,momentum)
    awarded=min(raw,CAP-total)
    return {'type':'courtReveal','grid':grid,'royals':dict(royals),'kind':kind,'momentum':momentum,'lineWins':wins,'rawUnits':raw,'winUnits':awarded,'totalUnits':total+awarded,**extra}

def base_record(grid,royals=None):
    event=reveal(grid,royals or {},'base',1,0)
    return {'events':[event], 'payoutMultiplier':event['winUnits']}

def bonus_record(tier):
    grid=board()
    # One Scatter on each selected reel, three/four/five triggers its tier.
    for c in range(3+tier): grid[c][rng.randrange(5)]='scatter'
    events=[reveal(grid,{},'base',1,0)]
    total=events[0]['totalUnits']; awarded=MODEL['bonus']['tiers'][tier]
    remaining=awarded; played=0;meter=0;momentum=1;royals={}
    for col in rng.sample(range(6),tier): royals[str(col)]=rng.choice([2,3,5])
    events.append({'type':'courtBonusStart','tier':tier,'spins':awarded,'royals':dict(royals)})
    while remaining and total<CAP:
        remaining-=1;played+=1;grid=board()
        if rng.random()<0.45:
            line=rng.choice(LINES);symbol=rng.choice(REGULAR)
            for c in range(rng.choice([3,3,4,5,6])): grid[c][line[c]]=symbol
        if len(royals)<6 and rng.random()<0.005:
            col=rng.choice([str(c) for c in range(6) if str(c) not in royals])
            royals[col]=rng.choice([2,3,5,8,12,20])
        for c in range(6):
            if str(c) not in royals and rng.random()<0.025: grid[c][rng.randrange(5)]='scatter'
        apply_royals(grid,royals)
        collected=sum(x=='scatter' for col in grid for x in col)
        meter+=collected; additions=0;newRoyals={}
        # Meter rewards affect the NEXT reveal, not the current outcome.
        next_royals=dict(royals)
        while meter>=4:
            meter-=4
            extra=min(2,24-awarded);awarded+=extra;remaining+=extra;additions+=extra
            available=[str(c) for c in range(6) if str(c) not in next_royals]
            if available:
                col=rng.choice(available);next_royals[col]=rng.choice([2,2,3,3,5]);newRoyals[col]=next_royals[col]
        event=reveal(grid,royals,'free',momentum,total,remaining=remaining,played=played,meter=meter,extraSpins=additions,nextRoyals=newRoyals)
        total=event['totalUnits'];momentum=min(5,momentum+1) if event['winUnits'] else 1
        event['nextMomentum']=momentum
        events.append(event);royals=next_royals
    events.append({'type':'courtBonusEnd','totalUnits':total})
    return {'events':events,'payoutMultiplier':total}

def create_pools():
    pools={k:[] for k in ['loss','small','medium','big','royal','bonus','jackpot']}
    targets={'loss':5000,'small':3000,'medium':2500,'big':1500,'royal':600,'bonus':400}
    attempts=0
    while any(len(pools[k])<targets[k] for k in ['loss','small','medium','big']):
        attempts+=1;grid=board()
        if rng.random()<0.85:
            symbol=rng.choice(REGULAR);line=rng.choice(LINES);length=rng.choice([3,3,4,4,5,6])
            for c in range(length): grid[c][line[c]]=symbol
        if rng.random()<0.15: grid[rng.randrange(6)][rng.randrange(5)]='wild'
        if rng.random()<0.3:
            for c in rng.sample(range(6),rng.choice([1,2])):grid[c][rng.randrange(5)]='scatter'
        record=base_record(grid);p=record['payoutMultiplier']
        key='loss' if p==0 else 'small' if p<100 else 'medium' if p<500 else 'big'
        if len(pools[key])<targets[key]:pools[key].append(record)
        if attempts>1000000:raise RuntimeError('Pool generation did not converge')
    while len(pools['royal'])<targets['royal']:
        grid=board();royals={str(c):rng.choice([2,3,5,8,12,20,40]) for c in rng.sample(range(6),rng.choice([1,2]))}
        apply_royals(grid,royals);record=base_record(grid,royals)
        if record['payoutMultiplier']>0:pools['royal'].append(record)
    for i in range(targets['bonus']):pools['bonus'].append(bonus_record(0 if i<340 else 1 if i<392 else 2))
    grid=[['king']*5 for _ in range(6)];royals={'0':250,'1':250};apply_royals(grid,royals)
    pools['jackpot']=[base_record(grid,royals)]
    # Distinct exact 0.20x / 0.35x anchors allow integer balancing at 0.05x resolution.
    for symbol,amount in [('A',20),('jersey',35)]:
        while True:
            grid=board()
            for c in range(3):grid[c][0]=symbol
            record=base_record(grid)
            if record['payoutMultiplier']==amount:break
        pools['anchor'+str(amount)]=[record]
    return pools

def main():
    pools=create_pools();N=1_000_000_000
    # Contributions are percentages of stake returned, not hit probabilities.
    budgets={'small':Fraction(15),'medium':Fraction(25),'big':Fraction(15),'royal':Fraction(10),'bonus':Fraction(26),'jackpot':Fraction(1,2)}
    records=[];returned=0;used=0
    for key,budget in budgets.items():
        pool=pools[key];payout_sum=sum(x['payoutMultiplier'] for x in pool)
        weight=int(budget*N//payout_sum)
        assert weight>0
        for rec in pool:rec['weight']=weight;rec['category']=key;records.append(rec)
        returned+=payout_sum*weight;used+=len(pool)*weight
    remainder=92*N-returned
    b=next(b for b in range(4) if remainder>=35*b and (remainder-35*b)%20==0)
    a=(remainder-35*b)//20
    for key,w in [('anchor20',a),('anchor35',b)]:
        if w:
            rec=pools[key][0];rec['weight']=w;rec['category']='small';records.append(rec);used+=w
    assert used<N,(used,N)
    q,r=divmod(N-used,len(pools['loss']))
    assert q>0
    for i,rec in enumerate(pools['loss']):rec['weight']=q+(i<r);rec['category']='loss';records.append(rec)
    rng.shuffle(records)
    publish=ROOT/'math/publish_files';publish.mkdir(parents=True,exist_ok=True)
    frontend=ROOT/'assets/math';frontend.mkdir(parents=True,exist_ok=True)
    compressed=publish/'books_base.jsonl.zst'
    with compressed.open('wb') as out, zstd.ZstdCompressor(level=10).stream_writer(out) as stream, (publish/'lookUpTable_base.csv').open('w',newline='') as csvfile:
        writer=csv.writer(csvfile,lineterminator='\n')
        for i,record in enumerate(records,1):
            record['id']=i
            for j,event in enumerate(record['events']):event['index']=j;event['modelVersion']=MODEL['version']
            book={k:record[k] for k in ['id','events','payoutMultiplier']}
            stream.write((json.dumps(book,separators=(',',':'))+'\n').encode())
            writer.writerow([i,record['weight'],record['payoutMultiplier']])
    (publish/'index.json').write_text(json.dumps({'modes':[{'name':'base','cost':1.0,'events':compressed.name,'weights':'lookUpTable_base.csv'}]},indent=2)+'\n')
    (frontend/'rounds.json').write_text(json.dumps({'version':MODEL['version'],'totalWeight':N,'records':records},separators=(',',':')))
    (ROOT/'js/model.js').write_text('// Generated from math/source/model.json. Rebuild math after changing rules.\nexport const MODEL = '+json.dumps(MODEL,separators=(',',':'))+';\n')
    report={'version':MODEL['version'],'rounds':len(records),'totalWeight':sum(x['weight'] for x in records),'weightedPayoutUnits':sum(x['weight']*x['payoutMultiplier'] for x in records)}
    rtp=Fraction(report['weightedPayoutUnits'],100*report['totalWeight']);assert rtp==Fraction(23,25)
    report.update(rtpExact=str(rtp),rtpPercent=float(100*rtp),hitRate=sum(x['weight'] for x in records if x['payoutMultiplier']>0)/N,bonusFrequency=sum(x['weight'] for x in records if x['category']=='bonus')/N,maxWin=max(x['payoutMultiplier'] for x in records)/100,formatSource='StakeEngine/math-sdk@141b4e89065ac4400769709a919259a923430c4d docs/rgs_docs/data_format.md',scope='Exact for this finite lookup-weighted complete-round distribution, not arbitrary independent reels or altered weights.')
    report['modelSha256']=hashlib.sha256((ROOT/'math/source/model.json').read_bytes()).hexdigest()
    report['sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in publish.iterdir() if p.is_file()}
    (ROOT/'math/REPORT.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2),flush=True)
if __name__=='__main__':main()
