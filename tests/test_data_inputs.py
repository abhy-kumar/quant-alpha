"""A data point that could not be fetched must stay unavailable, never become a neutral-looking value."""
import numpy as np
import pandas as pd
import pytest
from bs4 import BeautifulSoup

from data_pipeline import data_fetcher as fetcher, nse_fetcher as nse
from engine import regime_engine


class Reply:
    def __init__(self, status=200, payload=None, text='x' * 200):
        self.status_code, self._payload, self.text, self.content = status, payload, text, text.encode()
        self.headers = {'Content-Type': 'application/json'}

    def json(self):
        if self._payload is None:
            raise ValueError('not json')
        return self._payload


class Session:
    def __init__(self, replies):
        self.replies = replies

    def get(self, url, **kwargs):
        for fragment, reply in self.replies.items():
            if fragment in url:
                return reply
        return Reply(503)


@pytest.fixture
def quiet(monkeypatch):
    monkeypatch.setattr(nse.time, 'sleep', lambda seconds: None)
    monkeypatch.setattr(nse, '_invalidate_nse_session', lambda: None)
    monkeypatch.setattr(nse, '_validate_nse_json_response', lambda reply, label='': True)


def test_failed_flow_and_option_fetches_are_unavailable_not_neutral(monkeypatch, quiet):
    monkeypatch.setattr(nse, '_create_nse_session', lambda: Session({}))
    monkeypatch.setattr(nse, '_fii_dii_from_moneycontrol', lambda: None)
    flows = nse.get_fii_dii_activity()
    assert flows['fii_net'] is None and flows['dii_net'] is None        # not 0
    assert nse.get_put_call_ratio()['pcr'] is None                      # not 1.0
    assert nse.get_market_breadth(pd.DataFrame())['breadth_pct'] is None  # not 0.5


def test_real_flow_and_option_values_are_read(monkeypatch, quiet):
    replies = {
        'fiidiiTradeReact': Reply(payload=[{'category': 'FII/FPI *', 'buyValue': '12000.5', 'sellValue': '6263.95'},
                                           {'category': 'DII **', 'buyValue': '9000', 'sellValue': '11253.58'}]),
        'option-chain-contract-info': Reply(payload={'expiryDates': ['24-Nov-2026']}),
        'option-chain-v3': Reply(payload={'records': {'data': [{'CE': {'openInterest': 1000}, 'PE': {'openInterest': 834}}]}}),
    }
    monkeypatch.setattr(nse, '_create_nse_session', lambda: Session(replies))
    flows = nse.get_fii_dii_activity()
    assert flows['fii_net'] == pytest.approx(5736.55) and flows['dii_net'] == pytest.approx(-2253.58)
    assert nse.get_put_call_ratio()['pcr'] == 0.834
    # An option chain with no open interest is a failed read, not a ratio of 1.
    replies['option-chain-v3'] = Reply(payload={'records': {'data': [{'CE': {'openInterest': 0}, 'PE': {'openInterest': 0}}]}})
    assert nse.get_put_call_ratio()['pcr'] is None


def test_fallback_flow_page_rejects_numbers_that_cannot_be_flows(monkeypatch):
    page = lambda text: monkeypatch.setattr(nse.requests, 'get', lambda *a, **k: Reply(text=text))
    page('<td>FII</td><td>14</td><td>2026</td> <td>DII</td><td>9,000.00</td><td>11,253.58</td>')
    result = nse._fii_dii_from_moneycontrol()
    assert result['fii_net'] is None and result['dii_net'] == pytest.approx(-2253.58)
    page('<td>FII</td><td>14</td><td>11</td>')
    assert nse._fii_dii_from_moneycontrol() is None


def nifty(above=True):
    close = pd.Series(np.linspace(100, 120 if above else 80, 260), index=pd.bdate_range('2025-01-01', periods=260))
    return pd.DataFrame({'Open': close, 'High': close, 'Low': close, 'Close': close, 'Volume': 1})


def test_regime_counts_only_available_readings():
    vix = pd.DataFrame({'Close': [14.0]})
    full = regime_engine.compute_regime(nifty(), vix, {'fii_net': 900}, {'pcr': 1.3}, .6)
    assert full == {'score': 5, 'readings': 5, 'parts': dict.fromkeys(regime_engine.READINGS, 1), 'missing': []}
    partial = regime_engine.compute_regime(nifty(False), None, {'fii_net': None}, {'pcr': None}, None)
    assert partial['score'] == -1 and partial['readings'] == 1 and partial['missing'] == ['vix', 'fii', 'pcr', 'breadth']
    # A true zero flow and a true neutral ratio are readings, and they score 0.
    neutral = regime_engine.compute_regime(nifty(), vix, {'fii_net': 0}, {'pcr': 1.0}, .5)
    assert neutral['readings'] == 5 and neutral['score'] == 2
    assert regime_engine.compute_regime_score(nifty(), vix, {'fii_net': 0}, {'pcr': 1.0}, .5) == 2
    assert regime_engine.compute_regime(None, None, None, None, float('nan'))['readings'] == 0


SCREENER = '''<html><body><ul id="top-ratios"><li><span class="name">ROCE</span><span class="number">18.0</span></li></ul>
<section id="analysis"><div class="pros"><ul><li>Company has reduced debt.</li></ul></div>
<div class="cons"><ul><li>Stock is trading at 4.1 times its book value</li>%s</ul></div></section></body></html>'''


def test_promoter_pledging_is_read_from_the_screener_analysis():
    info = {}
    fetcher._parse_screener_pledge(BeautifulSoup(SCREENER % '<li>Promoters have pledged 43.7% of their holding.</li>', 'html.parser'), info)
    assert info == {'promoter_pledging': 43.7, 'promoter_pledging_checked': True}
    clean = {}
    fetcher._parse_screener_pledge(BeautifulSoup(SCREENER % '', 'html.parser'), clean)
    assert clean == {'promoter_pledging_checked': True}                  # none flagged: no invented zero
    odd = {}
    fetcher._parse_screener_pledge(BeautifulSoup(SCREENER % '<li>Promoters have pledged 430% of their holding.</li>', 'html.parser'), odd)
    assert 'promoter_pledging' not in odd


def test_pledging_above_twenty_percent_raises_the_red_flag():
    from engine.ranking import red_flags
    healthy = {'bookValue': 50, 'trailingEps': 4, 'netIncomeToCommon': 10}
    assert red_flags({**healthy, 'promoter_pledging': 43.7}) == ['Promoter pledging exceeds 20%']
    assert red_flags({**healthy, 'promoter_pledging': 12.0}) == []
    assert red_flags(healthy) == []                                      # unknown pledging is not a flag


class Ticker:
    def __init__(self, rows):
        self.cashflow = pd.DataFrame(rows, index=['2026-03-31', '2025-03-31']).T if rows else pd.DataFrame()


def test_free_cash_flow_falls_back_to_the_annual_statement():
    reported = {}
    fetcher._fill_free_cash_flow(Ticker({'Free Cash Flow': [420.0, 300.0], 'Operating Cash Flow': [900.0, 1.0]}), reported)
    assert reported['freeCashflow'] == 420.0 and reported['freeCashflow_source'] == 'annual statement'
    derived = {}
    fetcher._fill_free_cash_flow(Ticker({'Operating Cash Flow': [900.0, 1.0], 'Capital Expenditure': [-350.0, 1.0]}), derived)
    assert derived['freeCashflow'] == 550.0
    kept = {'freeCashflow': 77.0}
    fetcher._fill_free_cash_flow(Ticker({'Free Cash Flow': [420.0, 300.0]}), kept)
    assert kept == {'freeCashflow': 77.0}                                # vendor value wins when present
    missing = {}
    fetcher._fill_free_cash_flow(Ticker({'Operating Cash Flow': [900.0, 1.0]}), missing)
    fetcher._fill_free_cash_flow(Ticker(None), missing)
    assert missing == {}                                                 # no capex: stays unavailable


def test_blocked_screener_is_not_called_for_every_stock(monkeypatch):
    monkeypatch.setitem(fetcher._screener_state, 'failures', fetcher.SCREENER_MAX_FAILURES)
    assert fetcher._screener_available() is False
    monkeypatch.setitem(fetcher._screener_state, 'failures', 0)
    monkeypatch.setitem(fetcher._screener_state, 'disabled_until', 0)
    assert fetcher._screener_available() is True


class ShareTicker:
    def __init__(self, fast=np.nan, sheet=None):
        self.fast_info = type('Fast', (), {'shares': fast})()
        self.balance_sheet = pd.DataFrame(sheet, index=['2026-03-31']).T if sheet else pd.DataFrame()


def test_missing_share_count_is_recovered_in_order_of_reliability():
    kept = {'sharesOutstanding': 100.0}
    fetcher._fill_share_count(ShareTicker(fast=999.0), kept)
    assert kept == {'sharesOutstanding': 100.0}
    implied = {'impliedSharesOutstanding': 3.6e9, 'marketCap': 1e12, 'currentPrice': 2400.0}
    fetcher._fill_share_count(ShareTicker(), implied)
    assert implied['sharesOutstanding'] == 3.6e9 and implied['sharesOutstanding_source'] == 'implied share count'
    from_cap = {'marketCap': 8.7e12, 'previousClose': 2400.0}
    fetcher._fill_share_count(ShareTicker(), from_cap)
    assert from_cap['sharesOutstanding'] == pytest.approx(3.625e9) and from_cap['sharesOutstanding_source'] == 'market value / price'
    from_sheet = {}
    fetcher._fill_share_count(ShareTicker(sheet={'Ordinary Shares Number': [3.6e9]}), from_sheet)
    assert from_sheet['sharesOutstanding_source'] == 'balance sheet'
    nothing = {'marketCap': 0, 'currentPrice': 0}
    fetcher._fill_share_count(ShareTicker(), nothing)
    assert 'sharesOutstanding' not in nothing                           # still unavailable, never guessed


def test_ranking_uses_vendor_market_value_when_share_count_is_missing():
    from engine.ranking import raw_factors
    item = {'sector': 'Industrials', 'latest': {'Close': 2400.0}}
    with_shares, _, _ = raw_factors({**item, 'info': {'sharesOutstanding': 1e9, 'marketCap': 9e99, 'freeCashflow': 2.4e11}})
    without, _, _ = raw_factors({**item, 'info': {'marketCap': 2.4e12, 'freeCashflow': 2.4e11}})
    neither, _, _ = raw_factors({**item, 'info': {'freeCashflow': 2.4e11}})
    assert with_shares['fcf_yield'] == pytest.approx(.1)                 # live price x shares still wins
    assert without['fcf_yield'] == pytest.approx(.1)
    assert np.isnan(neither['fcf_yield'])


def test_published_row_never_turns_a_missing_figure_into_zero():
    import inspect
    from engine import scoring
    source = inspect.getsource(scoring)
    for field in ('totalRevenue', 'netIncomeToCommon', 'ebitda', 'marketCap'):
        assert f'info.get("{field}"), 0)' not in source
    assert 'info.get("forwardPE"), item["pe"])' not in source           # trailing P/E must not pose as forward
