import React from 'react'
import { Target, Scales, ChartPieSlice } from '@phosphor-icons/react'
import { GlassCard, GlassCardHeader, GlassCardContent } from '../common/shared'

interface ModelPortfoliosCardProps {
  maxSharpe: Record<string, number>
  minVolatility: Record<string, number>
  riskParity: Record<string, number>
  onSelectTicker: (ticker: string) => void
}

export const ModelPortfoliosCard: React.FC<ModelPortfoliosCardProps> = ({
  maxSharpe,
  minVolatility,
  riskParity,
  onSelectTicker,
}) => {
  const portfolios = [
    { title: 'Max Sharpe', tooltipId: 'quant.max-sharpe', icon: Target, data: maxSharpe, accent: 'var(--brand)', iconColor: 'var(--brand)' },
    { title: 'Min Volatility', tooltipId: 'quant.min-vol', icon: Scales, data: minVolatility, accent: 'var(--amber)', iconColor: 'var(--amber)' },
    { title: 'Risk Parity (ERC)', tooltipId: 'quant.risk-parity', icon: ChartPieSlice, data: riskParity, accent: 'var(--blue)', iconColor: 'var(--blue)' },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {portfolios.map(port => (
        <GlassCard key={port.title}>
          <GlassCardHeader
            icon={port.icon}
            iconColor={port.iconColor}
            title={port.title}
            tooltipId={port.tooltipId}
          />
          <GlassCardContent className="p-4 space-y-2.5 max-h-56 overflow-y-auto scrollbar-none">
            {Object.entries(port.data).length === 0 ? (
              <p className="text-xs text-[var(--text-3)]">No weights allocated.</p>
            ) : (
              Object.entries(port.data).map(([ticker, weight]) => (
                <div key={ticker}>
                  <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-2)' }}>
                    <button
                      onClick={() => onSelectTicker(ticker)}
                      className="ticker-link"
                      title={`View ${ticker.replace('.NS', '')} chart`}
                    >
                      {ticker.replace('.NS', '')}
                    </button>
                    <span className="typo-num-sm">{(Number(weight) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1 rounded-full w-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Number(weight) * 100}%`, background: port.accent }} />
                  </div>
                </div>
              ))
            )}
          </GlassCardContent>
        </GlassCard>
      ))}
    </div>
  )
}
