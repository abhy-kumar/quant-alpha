"""Evaluate immutable versioned recommendations only after their outcomes mature."""
import argparse
import json
import sqlite3
from pathlib import Path
import numpy as np
import pandas as pd
from engine.ranking import MODEL_VERSION
from engine.ranking_validation import block_interval


def evaluate(database, version=MODEL_VERSION):
    with sqlite3.connect(Path(database).resolve().as_uri()+'?mode=ro',uri=True) as conn:
        exists=conn.execute("SELECT 1 FROM sqlite_master WHERE name='ranking_history'").fetchone()
        if not exists:
            return {'version':version,'status':'No versioned snapshots yet','horizons':{}}
        snapshots=pd.read_sql_query('SELECT * FROM ranking_history WHERE Model_Version=?',conn,params=[version])
        quotes=pd.read_sql_query('SELECT Ticker,Date,Close FROM daily_ohlcv',conn)
    prices=quotes.pivot_table(index='Date',columns='Ticker',values='Close',aggfunc='last').sort_index()
    prices.index=pd.to_datetime(prices.index)
    if '^NSEI' not in prices:
        return {'version':version,'status':'Benchmark unavailable','horizons':{}}
    prices=prices.loc[prices['^NSEI'].notna()]
    result={'version':version,'snapshots':len(snapshots),'status':'Forward validation pending',
            'method':'Saved inputs only. Enter at the next session close after recording. Actual deployment time is not recorded; delayed publication requires separate verification. Fixed horizon, 20bp each side. Overlapping outcomes are not independent trades.', 'horizons':{}}
    for horizon, sessions, score_key, label_key in [('short',21,'Composite_Score_Tech','Tactical_Conviction'),('long',63,'Composite_Score_Long','Conviction_Long')]:
        samples=[]; pending=0; missing=0
        for record in snapshots.itertuples():
            row=json.loads(record.Payload)['row']
            if not row.get('Ranking_Eligible',{}).get(horizon):continue
            published=pd.Timestamp(record.Recorded_At).tz_convert('Asia/Kolkata')
            day=published.tz_localize(None).normalize()
            # A generated snapshot is not proof of deployment before today's close.
            entry=prices.index.searchsorted(day,side='right')
            exit_idx=entry+sessions
            if exit_idx>=len(prices): pending+=1; continue
            ticker=row['Ticker']
            if ticker not in prices: missing+=1; continue
            entry_price,exit_price=prices[ticker].iloc[entry],prices[ticker].iloc[exit_idx]
            if not np.isfinite(entry_price) or not np.isfinite(exit_price) or min(entry_price,exit_price)<=0:
                missing+=1;continue
            ret=exit_price/entry_price*(1-.002)/(1+.002)-1
            benchmark=prices['^NSEI'].iloc[exit_idx]/prices['^NSEI'].iloc[entry]-1
            samples.append({'entry':str(prices.index[entry].date()),'ticker':ticker,'score':row[score_key],
                            'label':row[label_key],'net_return':ret,'net_excess':ret-benchmark})
        frame=pd.DataFrame(samples)
        summary={'matured':len(frame),'pending':pending,'missing_quotes':missing}
        if not frame.empty:
            # Multiple non-trading-day publications must not duplicate a trade.
            frame=frame.drop_duplicates(['entry','ticker'],keep='first')
            ic=frame.groupby('entry').apply(lambda g:g.score.corr(g.net_excess,method='spearman') if len(g)>=20 and g.score.nunique()>1 else np.nan).dropna()
            summary.update({'matured':len(frame),'dates':frame.entry.nunique(),'mean_daily_ic':float(ic.mean()) if len(ic) else None,
                            'ic_block_95_interval':block_interval(ic,sessions),
                            'labels':frame.groupby('label').agg(
                                n=('net_return','size'),
                                mean_net_excess=('net_excess','mean'),
                                positive_excess_fraction=('net_excess',lambda x:float((x>0).mean()))
                            ).to_dict('index')})
            result['status']='Exploratory forward outcomes available; confidence and sample size still require review'
        result['horizons'][horizon]=summary
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--database',default='data/market_scans.db')
    parser.add_argument('--version',default=MODEL_VERSION)
    parser.add_argument('--output',default='data/ranking-forward-validation.json')
    args=parser.parse_args()
    report=evaluate(args.database,args.version)
    Path(args.output).write_text(json.dumps(report,indent=2,allow_nan=False),encoding='utf8')
    print(report['status'])
