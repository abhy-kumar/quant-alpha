import sys

with open('frontend/src/components/QuantLabTab.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace("import { SegmentedControl } from './shared'", "import { SegmentedControl, InfoTooltip } from './shared'")

c = c.replace('Market Regime\n            </div>', '<InfoTooltip id="quant.regime-score">Market Regime</InfoTooltip>\n            </div>')
c = c.replace("color: 'var(--text-3)' }}>Score</div>", "color: 'var(--text-3)' }}><InfoTooltip id='quant.regime-score'>Score</InfoTooltip></div>")
c = c.replace("color: 'var(--text-3)' }}>Breadth</div>", "color: 'var(--text-3)' }}><InfoTooltip id='quant.regime-breadth'>Breadth</InfoTooltip></div>")
c = c.replace("color: 'var(--text-3)' }}>VIX</div>", "color: 'var(--text-3)' }}><InfoTooltip id='quant.regime-vix'>VIX</InfoTooltip></div>")

c = c.replace("label: 'CAGR (Alpha Picks)'", "label: <InfoTooltip id='quant.cagr'>CAGR (Alpha Picks)</InfoTooltip>")
c = c.replace("label: 'Ann. Volatility'", "label: <InfoTooltip id='quant.volatility'>Ann. Volatility</InfoTooltip>")
c = c.replace("label: 'Sharpe Ratio'", "label: <InfoTooltip id='quant.sharpe'>Sharpe Ratio</InfoTooltip>")
c = c.replace("label: 'Max Drawdown'", "label: <InfoTooltip id='quant.max-dd'>Max Drawdown</InfoTooltip>")

c = c.replace('key={stat.label}', 'key={i}')
c = c.replace('.map(stat => (', '.map((stat, i) => (')

c = c.replace("color: 'var(--text-2)' }}>Strategy Backtest · Top 10 Equal Weight</span>", "color: 'var(--text-2)' }}><InfoTooltip id='quant.backtest'>Strategy Backtest · Top 10 Equal Weight</InfoTooltip></span>")

c = c.replace("title: 'Max Sharpe Portfolio'", "title: <InfoTooltip id='quant.max-sharpe'>Max Sharpe Portfolio</InfoTooltip>")
c = c.replace("title: 'Min Volatility Portfolio'", "title: <InfoTooltip id='quant.min-vol'>Min Volatility Portfolio</InfoTooltip>")

c = c.replace('key={port.title}', 'key={i}')
c = c.replace('.map(port => (', '.map((port, i) => (')

c = c.replace("color: 'var(--green)' }} />Portfolio Factor Exposure", "color: 'var(--green)' }} /><InfoTooltip id='quant.factor-exposure'>Portfolio Factor Exposure</InfoTooltip>")
c = c.replace("color: 'var(--blue)' }} />Sector Allocation", "color: 'var(--blue)' }} /><InfoTooltip id='quant.sector-allocation'>Sector Allocation</InfoTooltip>")
c = c.replace("color: 'var(--amber)' }} />Asset Correlation", "color: 'var(--amber)' }} /><InfoTooltip id='quant.correlation'>Asset Correlation</InfoTooltip>")

with open('frontend/src/components/QuantLabTab.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
