import sys,json,argparse
from pathlib import Path
import numpy as np
import pandas as pd
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from engine.ranking_validation import panel_from_prices,build_features,block_interval
parser=argparse.ArgumentParser(description='Exploratory evaluation of recovered Git snapshots')
parser.add_argument('--snapshots',required=True)
parser.add_argument('--prices',required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args()
snapshots=pd.read_pickle(args.snapshots)
prices,volume=panel_from_prices(args.prices)
features=build_features(prices,volume)
records=[]
for available,group in snapshots.groupby('Available_At'):
    stamp=pd.Timestamp(available).tz_convert('Asia/Kolkata')
    day=stamp.tz_localize(None).normalize()
    cutoff=day if (stamp.hour,stamp.minute)>=(15,45) else day-pd.Timedelta(days=1)
    past=prices.index[prices.index<=cutoff]
    entry=prices.index.searchsorted(day,side='right')
    if not len(past) or entry+21>=len(prices): continue
    observed=past[-1]
    if observed not in features.index.get_level_values('Date'):continue
    sample=group.drop_duplicates('Ticker').set_index('Ticker').join(features.xs(observed),how='inner')
    sample=sample[sample.Sector!='ETF']
    if len(sample)<40:continue
    target=prices.iloc[entry+21]/prices.iloc[entry]-1
    sample['target']=target.reindex(sample.index)
    sample['quality']=5.
    for sector,sector_rows in sample.groupby('Sector'):
        peers=sector_rows if len(sector_rows)>=8 else sample[sample.Sector.eq('Financial Services')==bool(sector=='Financial Services')]
        for field,weight in [('ROE_%',.6),('ROCE_%',.4)]:
            values=pd.to_numeric(peers[field],errors='coerce').dropna()
            if len(values)<8:continue
            for ticker in sector_rows.index:
                value=pd.to_numeric(sample.loc[ticker,field],errors='coerce')
                if pd.notna(value):sample.loc[ticker,'quality']+=weight*(10*((values<value).sum()+.5*(values==value).sum())/len(values)-5)
    ey=1/pd.to_numeric(sample['P/E'],errors='coerce').replace(0,np.nan)
    sample['value']=10*(ey.rank(method='average')-.5)/ey.notna().sum()
    # Partial reconstruction is a diagnostic; missing book/CF inputs are not invented.
    sample['partial_blend']=.25*sample.quality+.2*sample.value.fillna(5)+10*(.25*sample.momentum+.15*sample.trend+.15*sample.stability)
    for col in ['Composite_Score','quality','value','momentum','trend','stability','partial_blend']:
        valid=sample[[col,'target']].apply(pd.to_numeric,errors='coerce').dropna()
        if len(valid)>=40 and valid[col].nunique()>1:
            records.append({'available':available,'feature_date':str(observed.date()),'entry':str(prices.index[entry].date()),
                            'exit':str(prices.index[entry+21].date()),'model':col,'n':len(valid),'ic':float(valid[col].corr(valid.target,method='spearman'))})
data=pd.DataFrame(records)
data=data.sort_values('available').drop_duplicates(['model','entry'],keep='last')
records=data.to_dict('records')
result={'scope':'Exploratory checks of historically published app data, not an independent test. Earnings yield and limited quality inputs are recoverable; complete v3 financial inputs are not.',
        'availability':'Use only price closes preceding each Git commit; enter on the next session after the commit date. Actual push/deployment timestamps are unavailable.',
        'limitation':'Stored provider fields may contain old input errors. No claim that a partial reconstruction validates the complete v3 model.',
        'results':{name:{'dates':len(g),'mean_daily_ic':float(g.ic.mean()),'ic_block_95_interval':block_interval(g.ic,21)} for name,g in data.groupby('model')},'daily':records}
Path(args.output).write_text(json.dumps(result,indent=2,allow_nan=False),encoding='utf8')
print(json.dumps(result['results']))
