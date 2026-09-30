import json
import subprocess
import argparse
from pathlib import Path
import pandas as pd
parser=argparse.ArgumentParser(description='Recover public ranking snapshots from Git publication history')
parser.add_argument('--repo',default='.')
parser.add_argument('--output',required=True)
parser.add_argument('--before',help='Exclusive publication cutoff, with timezone, e.g. 2026-10-01T00:00:00+05:30')
args=parser.parse_args()
ROOT=Path(args.repo)
OUT=Path(args.output)
OUT.mkdir(parents=True,exist_ok=True)
log=subprocess.check_output(['git','log','--all','--format=%H|%cI','--','frontend/public/market_data.json'],cwd=ROOT,text=True)
daily={}
for line in log.splitlines():
    sha,stamp=line.split('|',1)
    if args.before and pd.Timestamp(stamp)>=pd.Timestamp(args.before): continue
    date=pd.Timestamp(stamp).tz_convert('Asia/Kolkata').strftime('%Y-%m-%d')
    if date not in daily or pd.Timestamp(stamp)>pd.Timestamp(daily[date][1]): daily[date]=(sha,stamp)
rows=[]
for date,(sha,stamp) in sorted(daily.items()):
    content=subprocess.check_output(['git','show',f'{sha}:frontend/public/market_data.json'],cwd=ROOT)
    try:
        obj=json.loads(content)
        data=obj.get('data',[]) if isinstance(obj,dict) else obj
        if not isinstance(data,list): continue
        for row in data:
            if not isinstance(row,dict) or not row.get('Ticker'): continue
            rows.append({**{k:v for k,v in row.items() if not isinstance(v,(list,dict))},'Available_Date':date,'Commit':sha,'Available_At':stamp})
    except (ValueError,TypeError): continue
frame=pd.DataFrame(rows)
frame.to_pickle(OUT/'git_snapshots.pkl')
summary={'commits':len(log.splitlines()),'dates':len(daily),'rows':len(frame),'first':frame.Available_Date.min(),'last':frame.Available_Date.max(),'fields':list(frame.columns)}
(OUT/'recovered_history.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
print(json.dumps(summary))
