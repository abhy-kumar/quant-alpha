from copy import deepcopy
from types import SimpleNamespace
import sqlite3
import numpy as np
import pandas as pd
import pytest
from engine.ranking import apply_ranking, raw_factors, midpoint_percentile, WEIGHTS
from engine.ranking_history import store_ranking_history
from data_pipeline.data_fetcher import _fetch_yoy_financials


def cohort(n=20, financial=False):
    rows=[]
    for i in range(n):
        prices=100*np.exp(np.linspace(0,.02+i*.025,260)+.01*np.sin(np.arange(260)))
        frame=pd.DataFrame({'Close':prices,'High':prices*1.01},index=pd.bdate_range('2025-01-01',periods=260))
        rows.append({'ticker':f'T{i:02}.NS','sector':'Financial Services' if financial else 'Technology','is_etf':False,
            'df':frame,'latest':frame.iloc[-1],'research':{},'info':{'returnOnEquity':.05+i*.01,'returnOnAssets':.01+i*.002,
            'roce':5+i,'profitMargins':.1+i*.01,'totalAssets':1000,'_statement_assets':True,'operatingCashflow':100+i*5,
            'netIncomeToCommon':50,'debtToEquity':150-i*5,'trailingEps':1+i*.3,'bookValue':30+i,'freeCashflow':80+i*10,'sharesOutstanding':10}})
    return rows


def test_midrank_ties_and_order_invariance():
    assert midpoint_percentile(5,[5]*100)==50
    rows=cohort(); a=apply_ranking(deepcopy(rows)); b=apply_ranking(list(reversed(deepcopy(rows))))
    assert {x['ticker']:x['composite_score_long'] for x in a}=={x['ticker']:x['composite_score_long'] for x in b}
    assert all(sum(weights.values())==pytest.approx(1) for weights in WEIGHTS.values())


def test_missing_fundamentals_cannot_become_recommendations():
    import json
    rows=cohort(); rows[-1]['info']={}
    x=apply_ranking(rows)[-1]
    assert x['conviction_long']=='Insufficient data'
    assert not x['ranking_eligible']['short']
    assert x['ranking_factors']['quality']==5
    assert x['ranking_percentiles']['short'] is None
    json.dumps(x['ranking_percentiles'],allow_nan=False)


def test_financials_not_destroyed_by_industrial_debt_rule():
    rows=cohort(financial=True)
    before=apply_ranking(deepcopy(rows))
    for row in rows: row['info']['debtToEquity']=2000
    after=apply_ranking(rows)
    assert [x['composite_score_long'] for x in before]==[x['composite_score_long'] for x in after]
    assert all(x['quality_penalty']==1 for x in after)


def test_price_history_windows_and_missing_quotes():
    row=cohort()[0]
    raw,_,_=raw_factors(row)
    assert raw['mom12']==pytest.approx(row['df'].Close.iloc[-22]/row['df'].Close.iloc[-253]-1)
    row['df'].iloc[-100,0]=np.nan
    raw,_,_=raw_factors(row)
    assert np.isnan(raw['mom12'])


def test_missing_trading_session_is_not_compressed_out_of_price_window():
    rows=cohort()
    calendar=rows[0]['df'].index
    rows[-1]['df']=rows[-1]['df'].drop(calendar[-10])
    x=apply_ranking(rows,trading_dates=calendar)[-1]
    assert x['ranking_inputs']['volatility'] is None
    assert x['tactical_conviction']=='Insufficient data'


def test_official_quote_completes_only_a_matching_adjusted_price_basis():
    from data_pipeline.quote_fallback import complete_from_bhav
    frame=pd.DataFrame({'Close':[100.],'Open':[99.],'High':[101.],'Low':[98.],'Volume':[1e6]},
                       index=pd.DatetimeIndex(['2026-09-29'],tz='Asia/Kolkata'))
    bhav=pd.DataFrame([{'SYMBOL':'A','PREV_CLOSE':100.,'OPEN_PRICE':101.,'HIGH_PRICE':103.,
                        'LOW_PRICE':99.,'CLOSE_PRICE':102.,'TTL_TRD_QNTY':1e6}])
    result,added=complete_from_bhav({'A.NS':frame},bhav,'2026-09-30')
    assert result['A.NS'].Close.tolist()==[100.,102.]
    assert str(added['A.NS'].index[-1].date())=='2026-09-30'
    bhav.loc[0,'PREV_CLOSE']=50.
    result,added=complete_from_bhav({'A.NS':frame},bhav,'2026-09-30')
    assert not added
    assert result['A.NS'].Close.tolist()==[100.]


def test_valuation_uses_current_price_and_negative_earnings():
    row=cohort()[0]; raw,_,_=raw_factors(row)
    row['latest']=row['latest'].copy(); row['latest']['Close']*=2
    changed,_,_=raw_factors(row)
    assert changed['earnings_yield']==pytest.approx(raw['earnings_yield']/2)
    row['info']['trailingEps']=-5
    assert raw_factors(row)[0]['earnings_yield']<0


def test_stale_quote_is_not_a_recommendation():
    rows=cohort(); rows[-1]['df']=rows[-1]['df'].iloc[:-3]
    rows[-1]['latest']=rows[-1]['df'].iloc[-1]
    assert apply_ranking(rows)[-1]['tactical_conviction']=='Insufficient data'


def test_entire_stale_cohort_cannot_outvote_the_benchmark_date():
    rows=apply_ranking(cohort(),reference_date='2026-01-02')
    assert all(x['conviction']=='Insufficient data' for x in rows)


def test_price_research_never_uses_future_prices_for_current_features():
    from engine.ranking_validation import build_features
    rng=np.random.default_rng(42)
    dates=pd.bdate_range('2022-01-01',periods=340)
    prices=pd.DataFrame(100*np.exp(np.cumsum(rng.normal(0,.02,(340,21)),axis=0)),index=dates,
                        columns=['NSEI']+[f'T{i}.NS' for i in range(20)])
    volume=pd.DataFrame(1e7,index=dates,columns=prices.columns)
    original=build_features(prices,volume)
    prices.loc[dates[300]:]*=5
    changed=build_features(prices,volume)
    pd.testing.assert_frame_equal(original.loc[:dates[299]],changed.loc[:dates[299]])


def test_price_research_excludes_classified_and_named_etfs(tmp_path):
    import json
    from engine.ranking_validation import panel_from_prices
    frame=pd.DataFrame({'Close':[100,101],'Volume':[1e7,1e7]},index=pd.bdate_range('2025-01-01',periods=2))
    for symbol in ['NSEI','GOLDBEES.NS','LIQUIDCASE.NS','A.NS']:
        frame.to_pickle(tmp_path/f'{symbol}.pkl')
    (tmp_path/'universe.json').write_text(json.dumps({'LIQUIDCASE.NS':{'sector':'ETF'}}))
    prices,_=panel_from_prices(tmp_path)
    assert set(prices.columns)=={'NSEI','A.NS'}


def test_empty_database_archives_nested_ranking_metadata(tmp_path,monkeypatch):
    from datetime import datetime,timezone
    from engine.scanner import _archive_scan
    monkeypatch.chdir(tmp_path)
    _archive_scan(pd.DataFrame([{'Ticker':'A.NS','Composite_Score':7.,'Ranking_Factors':{'quality':8.}}]),datetime.now(timezone.utc))
    with sqlite3.connect(tmp_path/'data/market_scans.db') as conn:
        assert conn.execute('SELECT Ranking_Factors FROM historical_scans').fetchone()[0]=='{"quality": 8.0}'


def test_each_horizon_percentile_uses_its_own_eligible_cohort():
    rows=apply_ranking(cohort())
    for row in rows:
        for horizon in WEIGHTS:
            pool=[x['ranking_scores'][horizon] for x in rows if x['ranking_eligible'][horizon]]
            if row['ranking_eligible'][horizon]:
                assert row['ranking_percentiles'][horizon]==midpoint_percentile(row['ranking_scores'][horizon],pool)


def test_statement_margin_and_liquidity_definitions():
    t=SimpleNamespace(financials=pd.DataFrame({'now':[200.,60.],'prev':[100.,40.]},index=['Total Revenue','Gross Profit']),
        balance_sheet=pd.DataFrame({'now':[110.,50.,25.,25.],'prev':[100.,30.,20.,20.]},index=['Total Assets','Current Assets','Current Liabilities','Total Debt']))
    info={}; _fetch_yoy_financials(t,info)
    assert info['yoy_gross_margin_change']==pytest.approx(-.1)
    assert info['yoy_current_ratio_change']==pytest.approx(.5)
    assert info['yoy_leverage_change']==pytest.approx(25/110-20/100)
    assert info['totalAssets']==110 and info['_statement_assets']


def test_model_history_never_overwrites_the_original_signal(tmp_path,monkeypatch):
    from data_pipeline import data_pipeline as pipeline
    path=tmp_path/'history.db'
    monkeypatch.setattr(pipeline,'_get_conn',lambda:sqlite3.connect(path))
    row={'Ticker':'A.NS','Ranking_Version':'ranking-v3.0','Composite_Score':6}
    store_ranking_history([row],'2026-10-01')
    store_ranking_history([{**row,'Composite_Score':9}],'2026-10-01')
    with sqlite3.connect(path) as c:
        payload=c.execute('SELECT Payload FROM ranking_history').fetchone()[0]
    assert '"Composite_Score": 6' in payload


def test_liquid_universe_is_not_an_alphabetical_slice(tmp_path,monkeypatch):
    from data_pipeline import nse_fetcher
    (tmp_path/'data').mkdir()
    with sqlite3.connect(tmp_path/'data/market_scans.db') as conn:
        conn.execute('CREATE TABLE daily_ohlcv (Ticker TEXT, Date TEXT, Close REAL, Volume REAL, PRIMARY KEY(Ticker,Date))')
        conn.executemany('INSERT INTO daily_ohlcv VALUES (?,?,?,?)',
            [(ticker,f'2026-09-{day:02}',100,volume) for ticker,volume in [('AAA.NS',100),('BBB.NS',200),('ZZZ.NS',10000)] for day in range(1,21)])
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(nse_fetcher,'download_bhav_copy',lambda:(pd.DataFrame(),None))
    assert nse_fetcher.get_liquid_universe(top_n=1)==['ZZZ.NS']


@pytest.mark.parametrize('recorded_at',['2025-01-01T11:00:00+00:00','2025-01-01T04:00:00+00:00'])
def test_forward_validation_enters_after_recording_day_and_keeps_unmatured_pending(tmp_path,recorded_at):
    import json
    from engine.ranking_forward_validation import evaluate
    path=tmp_path/'forward.db'
    row={'Ticker':'A.NS','Ranking_Eligible':{'short':True,'long':True},'Composite_Score_Tech':8,
         'Composite_Score_Long':8,'Tactical_Conviction':'Buy','Conviction_Long':'Buy'}
    dates=pd.bdate_range('2025-01-01',periods=40)
    with sqlite3.connect(path) as conn:
        conn.execute('CREATE TABLE ranking_history (Model_Version TEXT, Scan_Date TEXT, Ticker TEXT, Recorded_At TEXT, Price_Date TEXT, Payload TEXT)')
        conn.execute('INSERT INTO ranking_history VALUES (?,?,?,?,?,?)',('ranking-v3.0','2025-01-01','A.NS',recorded_at,'2025-01-01',json.dumps({'row':row})))
        conn.execute('CREATE TABLE daily_ohlcv (Ticker TEXT, Date TEXT, Close REAL)')
        conn.executemany('INSERT INTO daily_ohlcv VALUES (?,?,?)',[(ticker,str(day.date()),100+i if ticker=='A.NS' else 100)
            for i,day in enumerate(dates) for ticker in ['A.NS','^NSEI']])
    result=evaluate(path)
    assert result['horizons']['short']['labels']['Buy']['mean_net_excess']==pytest.approx(122/101*.998/1.002-1)
    assert result['horizons']['long']['pending']==1
    assert result['horizons']['long']['matured']==0
