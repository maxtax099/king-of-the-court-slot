"""Independent exhaustive verifier of the actual compressed publication files.
Recomputes line awards by scanning all prefix lengths, then audits bonus states.
No simulation estimates are used for the RTP claim.
"""
import json,csv,io,hashlib
from pathlib import Path
from fractions import Fraction
import zstandard as zstd
ROOT=Path(__file__).resolve().parents[2]
MODEL=json.loads((ROOT/'math/source/model.json').read_text());PAYS={s['id']:s['pays'] for s in MODEL['symbols'] if 'pays' in s};CAP=MODEL['maxWinUnits']

def independent_payout(event):
    grid=event['grid'];royals=event['royals'];momentum=event['momentum']
    assert len(grid)==6 and all(len(col)==5 for col in grid)
    assert all(s in {x['id'] for x in MODEL['symbols']} for col in grid for s in col)
    assert all(grid[int(col)]==['royal']*5 for col in royals)
    assert all(str(c) in royals for c in range(6) if 'royal' in grid[c])
    assert all(m in MODEL['royalMultipliers'] for m in royals.values())
    amounts=[]
    for line in MODEL['lines']:
        seq=[grid[c][r] for c,r in enumerate(line)];candidates=[]
        for length in range(3,7):
            prefix=seq[:length]
            for symbol,table in PAYS.items():
                if symbol=='wild':
                    valid=length==6 and all(x in ['wild','royal'] for x in prefix)
                else:
                    valid=symbol in prefix and all(x in [symbol,'wild','royal'] for x in prefix)
                    # Only the longest run for this symbol is eligible.
                    valid=valid and (length==6 or seq[length] not in [symbol,'wild','royal'])
                if valid:
                    factor=sum(royals.get(str(c),0) for c in range(length)) or 1
                    candidates.append(table[length-3]*factor*momentum)
        amounts.append(max(candidates,default=0))
    actual=[0]*19
    for win in event['lineWins']:assert actual[win['line']]==0;actual[win['line']]=win['units']
    assert actual==amounts,(actual,amounts)
    return sum(amounts)

def verify_book(book):
    total=0;free_count=0;remaining=0;awarded=0;meter=0;next_momentum=1;sticky={};saw_start=False;saw_end=False;base_scatters=0
    for index,event in enumerate(book['events']):
        assert event['index']==index and event['modelVersion']==MODEL['version']
        if event['type']=='courtBonusStart':
            assert not saw_start and base_scatters>=3;saw_start=True
            tier=min(2,base_scatters-3);assert event['tier']==tier
            remaining=awarded=MODEL['bonus']['tiers'][tier];assert event['spins']==remaining
            sticky=event['royals'];assert len(sticky)==tier
        elif event['type']=='courtBonusEnd':
            assert saw_start and not saw_end and (remaining==0 or total==CAP)
            assert event['totalUnits']==total;saw_end=True
        else:
            assert event['type']=='courtReveal' and not saw_end
            raw=independent_payout(event);assert raw==event['rawUnits']
            assert event['winUnits']==min(raw,CAP-total);total+=event['winUnits'];assert event['totalUnits']==total
            if event['kind']=='base':
                assert index==0 and event['momentum']==1 and len(event['royals'])<=2
                base_scatters=sum(s=='scatter' for reel in event['grid'] for s in reel)
            else:
                assert saw_start and remaining>0
                free_count+=1;remaining-=1
                assert event['played']==free_count and event['momentum']==next_momentum
                assert all(event['royals'].get(col)==value for col,value in sticky.items())
                # At most one spontaneous Royal Reel may appear per free reveal.
                assert len(event['royals'])-len(sticky)<=1
                collected=sum(s=='scatter' for reel in event['grid'] for s in reel);meter+=collected;triggers=meter//4;meter%=4
                extra=min(2*triggers,24-awarded);awarded+=extra;remaining+=extra
                assert event['remaining']==remaining and event['meter']==meter and event['extraSpins']==extra
                assert len(event['nextRoyals'])==min(triggers,6-len(event['royals']))
                assert not set(event['nextRoyals'])&set(event['royals'])
                sticky={**event['royals'],**event['nextRoyals']}
                next_momentum=min(5,next_momentum+1) if event['winUnits'] else 1
                assert event['nextMomentum']==next_momentum
    assert bool(base_scatters>=3)==saw_start
    assert saw_start==saw_end
    assert total==book['payoutMultiplier'] and total<=CAP
    assert awarded<=24 and free_count<=24


def main():
    pub=ROOT/'math/publish_files';manifest=json.loads((pub/'index.json').read_text());mode=manifest['modes'][0]
    assert mode['name']=='base' and mode['cost']==1 and len(manifest['modes'])==1
    lookup={}
    for row in csv.reader((pub/mode['weights']).open()):
        assert len(row)==3
        id,weight,payout=map(int,row);assert id>0 and weight>0 and payout>=0 and id not in lookup
        lookup[id]=(weight,payout)
    seen=set();total_weight=0;weighted_payout=0;hits=0;bonuses=0;largest=0
    catalog=json.loads((ROOT/'assets/math/rounds.json').read_text());catalog_by_id={r['id']:r for r in catalog['records']}
    with (pub/mode['events']).open('rb') as file, zstd.ZstdDecompressor().stream_reader(file) as reader:
        for line in io.TextIOWrapper(reader):
            book=json.loads(line);id=book['id'];assert id not in seen;seen.add(id)
            verify_book(book)
            weight,payout=lookup[id];assert payout==book['payoutMultiplier']
            local=catalog_by_id[id];assert local['weight']==weight
            assert {k:local[k] for k in ['id','events','payoutMultiplier']}==book
            total_weight+=weight;weighted_payout+=weight*payout;hits+=weight*(payout>0)
            bonuses+=weight*any(e['type']=='courtBonusStart' for e in book['events']);largest=max(largest,payout)
    assert seen==set(lookup)==set(catalog_by_id)
    assert total_weight==catalog['totalWeight']
    exact=Fraction(weighted_payout,100*total_weight);assert exact==Fraction(23,25)
    report=json.loads((ROOT/'math/REPORT.json').read_text())
    assert hashlib.sha256((ROOT/'math/source/model.json').read_bytes()).hexdigest()==report['modelSha256']
    assert report['weightedPayoutUnits']==weighted_payout and report['totalWeight']==total_weight
    assert largest==CAP
    for name,digest in report['sha256'].items():assert hashlib.sha256((pub/name).read_bytes()).hexdigest()==digest
    result={'verifiedRounds':len(seen),'exactRtp':str(exact),'rtpPercent':float(100*exact),'weightedPayoutUnits':weighted_payout,'totalWeight':total_weight,'hitRate':hits/total_weight,'bonusFrequency':bonuses/total_weight,'maxWin':largest/100,'checks':'Compressed books, lookup IDs/payouts/weights, every payline and multiplier, sticky royals, meter/retrigger limits, full-round cap, demo catalog parity and publication hashes'}
    (ROOT/'math/VERIFICATION.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
