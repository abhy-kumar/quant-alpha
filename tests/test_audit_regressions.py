import sqlite3
from datetime import datetime
import numpy as np
import pandas as pd
import pytest
from engine import backtest_engine as backtest, quant_engine as quant, ml_engine as ml
from engine.recommendation import check_forensic_red_flags
from data_pipeline import data_pipeline as pipeline

def market(n=65):
    dates = pd.bdate_range('2025-01-01', periods=n)
    prices = pd.DataFrame({'A.NS':100.,'B.NS':100.,'^NSEI':100.},index=dates)
    volume = prices * 2000
    return prices, volume

def score(p,v,h,l,tickers,idx):
    return pd.Series({t:10. for t in tickers})

def simulate(prices,volumes,**kwargs):
    return backtest.run_walkforward_backtest(score,prices,volumes,prices,prices,['A.NS','B.NS'],5,**kwargs)

def test_gap_stop_books_actual_loss_and_exit_fee():
    p,v=market(); p.loc[p.index[61]:,'A.NS']=80
    result=simulate(p,v,top_n=1,stop_loss_pct=.08)
    assert 79.5 < result['chart'][1]['portfolio'] < 80
    assert result['chart'][-1]['portfolio'] < 81

def test_weights_drift_without_hidden_daily_rebalance():
    p,v=market();p.loc[p.index[61],'A.NS']=200
    result=simulate(p,v,top_n=2)
    assert result['chart'][-1]['portfolio'] == pytest.approx(100/1.002,abs=.01)

def test_missing_benchmark_never_becomes_cash():
    p,v=market();result=simulate(p.drop(columns='^NSEI'),v)
    assert not result['chart']
    assert 'benchmark' in result['error']

def test_future_liquidity_cannot_admit_an_illiquid_stock():
    p,v=market(100);v['A.NS']=1;v.loc[v.index[80]:,'A.NS']=10_000_000
    result=simulate(p,v,as_of_date=str(p.index[64].date()),top_n=2)
    assert all('A.NS' not in h['tickers'] for h in result['holdings'])

def test_missing_held_quote_fails_instead_of_renormalizing():
    p,v=market();p.loc[p.index[62],'A.NS']=np.nan
    with pytest.raises(ValueError,match='Missing executable'):
        simulate(p,v,top_n=1)

def test_cv_uses_entire_date_groups_and_only_past_mature_labels():
    groups=np.repeat(np.arange(120),5);X=np.zeros((len(groups),1))
    splitter=ml.PurgedGroupTimeSeriesSplit(n_splits=3,purge_window=21)
    for train,valid in splitter.split(X,groups=groups):
        assert groups[train].max() < groups[valid].min()-21
        assert not set(groups[train]) & set(groups[valid])
        assert len(valid)%5 == 0

def test_predictions_preserve_canonical_feature_scales():
    class Model:
        def predict_proba(self,X):
            assert X.iloc[0].Tech_Score == 9
            assert X.iloc[0].Vol_60D == 25
            assert X.iloc[0].RSI_Value == 70
            return np.array([[.2,.8]])
    assert ml.predict_stock_alpha({'Tech_Score':9,'Vol_60D':25,'RSI_Value':70},Model())['ml_alpha_prob']==80

def test_fractional_negative_roe_triggers_severe_flag():
    assert any('Severe Negative' in f for f in check_forensic_red_flags({'returnOnEquity':-.2}))

@pytest.fixture
def database(tmp_path,monkeypatch):
    path=str(tmp_path/'research.db')
    monkeypatch.setattr(pipeline,'DB_PATH',path)
    monkeypatch.setattr(pipeline,'_schema_initialized',False)
    monkeypatch.setattr(quant,'DB_PATH',path)
    pipeline.ensure_schema()
    return path

def test_longer_outcomes_fill_after_21_day_label_exists(database):
    dates=pd.bdate_range('2025-01-01',periods=90)
    scan=str(dates[0].date())
    pipeline.store_factor_history([{'Ticker':'A.NS'}],scan)
    pipeline.create_outcome_entries([{'Ticker':'A.NS','Conviction':'Buy'}],scan)
    with sqlite3.connect(database) as conn:
        conn.execute('UPDATE outcome_tracking SET Return_21d=21')
    frame=pd.DataFrame({'Close':100+np.arange(90),'High':101+np.arange(90),'Low':99+np.arange(90)},index=dates.tz_localize('Asia/Kolkata'))
    pipeline.update_outcome_tracking(str(dates[-1].date()),{'A.NS':frame})
    with sqlite3.connect(database) as conn:
        row=conn.execute('SELECT Return_63d, Return_126d FROM outcome_tracking').fetchone()
    assert row==(63.0,None)
    accuracy=pipeline.get_outcome_accuracy()
    assert accuracy.iloc[0].win_rate_63d==1

def test_null_long_horizon_not_counted_as_failure(database):
    with sqlite3.connect(database) as conn:
        conn.executemany('INSERT INTO outcome_tracking(Ticker,Scan_Date,Conviction_At_Scan,Return_21d,Return_63d) VALUES(?,?,?,?,?)',
                         [('A','2025-01-01','Buy',5,10),('B','2025-01-01','Buy',5,None)])
    accuracy=pipeline.get_outcome_accuracy()
    assert accuracy.iloc[0].win_rate_63d==1
    assert accuracy.iloc[0].n_63d==1

def test_empty_ic_history_has_no_invented_alpha(database):
    assert all(f['ic_current'] is None and f['t_stat'] is None and f['status']=='Insufficient history' for f in quant.compute_factor_ic_monitor())

def test_frontier_uses_observed_covariance():
    rng=np.random.default_rng(42)
    frame=pd.DataFrame(rng.normal(.001,.01,(100,3)))
    points=quant.compute_efficient_frontier(frame)
    assert len(points)>10
    assert points!=quant.compute_efficient_frontier(frame*2)

def test_screener_period_columns_and_gross_block_not_profit():
    from bs4 import BeautifulSoup
    from data_pipeline.data_fetcher import _parse_screener_financials
    soup=BeautifulSoup('<section id="quarters"><table><tbody><tr><td>Sales +</td><td>100</td><td>110</td><td>120</td><td>130</td><td>150</td></tr><tr><td>Net Profit +</td><td>10</td><td>11</td><td>12</td><td>13</td><td>15</td></tr></tbody></table></section><section id="profit-loss"><table><tbody><tr><td>Gross Block</td><td>999</td></tr></tbody></table></section>','html.parser')
    info={};_parse_screener_financials(soup,info)
    assert info['revenueGrowth']==.5 and info['earningsGrowth']==.5
    assert 'grossProfits' not in info

def test_cached_fundamentals_do_not_slide_expiry(monkeypatch):
    from data_pipeline import data_fetcher as fetcher
    original={'trailingPE':10,'returnOnEquity':.15,'_schema_version':3}
    monkeypatch.setattr(fetcher.cache_manager,'get',lambda name,*args,**kwargs:original if name=='fundamentals' else {'sector':'Test'})
    monkeypatch.setattr(fetcher.cache_manager,'set',lambda *args:pytest.fail('Cache timestamp must not reset'))
    monkeypatch.setattr(fetcher,'_fetch_news_sentiment',lambda _:0)
    assert fetcher.fetch_fundamentals('A.NS')['trailingPE']==10
    assert 'news_sentiment' not in original

def test_scanner_stores_benchmark_and_propagates_storage_failure(monkeypatch):
    from engine import scanner
    from engine import ranking_history
    monkeypatch.setattr(ranking_history,'store_ranking_history',lambda *args:None)
    seen=[]
    monkeypatch.setattr(scanner,'store_daily_ohlcv',lambda data,date:seen.append(data))
    monkeypatch.setattr(scanner,'store_factor_history',lambda *a:(_ for _ in ()).throw(RuntimeError('storage failed')))
    nifty=pd.DataFrame({'Close':[100]})
    with pytest.raises(RuntimeError,match='storage failed'):
        scanner._store_ml_data([],{},nifty,0,0,0,0,0,0,0,datetime(2025,1,1))
    assert seen[0]['^NSEI'] is nifty


def test_ml_target_hurdle_is_one_percentage_point():
    target=ml.outperformance_target(pd.Series([5.5,6.,7.]),pd.Series([5.,5.,5.]))
    assert target.tolist()==[0,1,1]

def test_cv_can_skip_immature_initial_folds():
    groups=np.repeat(np.arange(60),5)
    folds=list(ml.PurgedGroupTimeSeriesSplit(n_splits=5).split(np.zeros((300,1)),groups=groups))
    assert folds
    assert all(groups[t].max() < groups[v].min()-21 for t,v in folds)

def test_atomic_json_preserves_previous_output_on_nonfinite_values(tmp_path):
    from utils import atomic_json
    path=tmp_path/'output.json'
    path.write_text('{"previous":true}')
    with pytest.raises(ValueError):
        atomic_json(str(path), {'value':float('nan')})
    assert path.read_text()=='{"previous":true}'
