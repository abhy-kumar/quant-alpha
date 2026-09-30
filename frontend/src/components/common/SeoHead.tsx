import { useEffect } from 'react'
import type { DashboardData } from '../../types'

interface SeoHeadProps {
  activeTab: 'charting' | 'picks' | 'fundamentals' | 'heatmap' | 'quantlab'
  selectedTicker?: string
  selectedAsset?: DashboardData | null
}

const TAB_SEO: Record<string, { title: string; description: string; path: string }> = {
  charting: {
    title: 'NSE Stock Technical Charts & Analysis | Alpha Quant',
    description: 'Interactive NSE stock charts with Wilder RSI, MACD, Supertrend, ATR volatility targets, and academic factor breakdown for 150 liquid equities.',
    path: '/',
  },
  picks: {
    title: 'High Conviction NSE Stock Signals & Alpha Picks | Alpha Quant',
    description: 'Daily high-conviction NSE stock recommendations computed across 10 academic factor models, Piotroski F-Score, and walk-forward ML classifiers.',
    path: '/signals',
  },
  fundamentals: {
    title: '150 NSE Stock Screener & Piotroski F-Score | Alpha Quant',
    description: 'Filter top 150 NSE Indian stocks by Piotroski F-Score, Novy-Marx Gross Profitability, Fama-French Value, Momentum, and Earnings Quality.',
    path: '/screen',
  },
  heatmap: {
    title: 'NSE Sector Heatmap & Market Breadth Analysis | Alpha Quant',
    description: 'Live visual sector performance heatmap, market breadth percentage, India VIX regime score, and institutional FII/DII flow tracking.',
    path: '/heatmap',
  },
  quantlab: {
    title: 'Strategy Backtesting & Factor Lab | Alpha Quant',
    description: 'Backtesting lab tracking factor Information Coefficients (IC), Sharpe ratios, maximum drawdowns, and 1-year historical equity curves.',
    path: '/quant',
  },
}

export function SeoHead({ activeTab, selectedTicker, selectedAsset }: SeoHeadProps) {
  useEffect(() => {
    const config = TAB_SEO[activeTab] || TAB_SEO.charting
    let pageTitle = config.title
    let pageDesc = config.description
    const canonicalUrl = `https://quant-alpha-sage.vercel.app${config.path}`
    const cleanTicker = selectedTicker ? selectedTicker.replace('.NS', '') : ''

    if (selectedTicker && selectedAsset && activeTab === 'charting') {
      const priceStr = selectedAsset.Price ? `₹${selectedAsset.Price.toLocaleString('en-IN')}` : ''
      const chgStr = selectedAsset['1d_Chg_%'] != null ? ` (${selectedAsset['1d_Chg_%'] >= 0 ? '+' : ''}${selectedAsset['1d_Chg_%'].toFixed(2)}%)` : ''
      pageTitle = `${cleanTicker} ${priceStr}${chgStr} Stock Chart & Quant Analysis | Alpha NSE`
      pageDesc = `Detailed quantitative research, Piotroski F-Score (${selectedAsset.Piotroski_F ?? 'N/A'}/9), and technical signals for ${cleanTicker} (${selectedAsset.Long_Name || cleanTicker}) on the NSE.`
    }

    // 1. Update Document Title
    document.title = pageTitle

    // 2. Update Meta Description
    let metaDesc = document.querySelector('meta[name="description"]')
    if (!metaDesc) {
      metaDesc = document.createElement('meta')
      metaDesc.setAttribute('name', 'description')
      document.head.appendChild(metaDesc)
    }
    metaDesc.setAttribute('content', pageDesc)

    // 3. Update Canonical Link
    let canonical = document.querySelector('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.setAttribute('rel', 'canonical')
      document.head.appendChild(canonical)
    }
    canonical.setAttribute('href', canonicalUrl)

    // 4. Update OpenGraph Tags
    const ogTitle = document.querySelector('meta[property="og:title"]')
    if (ogTitle) ogTitle.setAttribute('content', pageTitle)

    const ogDesc = document.querySelector('meta[property="og:description"]')
    if (ogDesc) ogDesc.setAttribute('content', pageDesc)

    const ogUrl = document.querySelector('meta[property="og:url"]')
    if (ogUrl) ogUrl.setAttribute('content', canonicalUrl)

    // 5. Update Twitter Card Tags
    const twTitle = document.querySelector('meta[name="twitter:title"]')
    if (twTitle) twTitle.setAttribute('content', pageTitle)

    const twDesc = document.querySelector('meta[name="twitter:description"]')
    if (twDesc) twDesc.setAttribute('content', pageDesc)

    // 6. Inject Dynamic BreadcrumbList and FinancialProduct JSON-LD
    let scriptTag = document.getElementById('dynamic-seo-ldjson')
    if (!scriptTag) {
      scriptTag = document.createElement('script')
      scriptTag.id = 'dynamic-seo-ldjson'
      scriptTag.setAttribute('type', 'application/ld+json')
      document.head.appendChild(scriptTag)
    }

    const schemas: any[] = [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
          {
            '@type': 'ListItem',
            'position': 1,
            'name': 'Home',
            'item': 'https://quant-alpha-sage.vercel.app/',
          },
          {
            '@type': 'ListItem',
            'position': 2,
            'name': selectedTicker && activeTab === 'charting' ? cleanTicker : activeTab.toUpperCase(),
            'item': canonicalUrl,
          },
        ],
      },
    ]

    if (selectedTicker && selectedAsset && activeTab === 'charting') {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'ItemPage',
        'name': `${cleanTicker} Stock Research & Factor Scorecard`,
        'url': canonicalUrl,
        'description': `Quantitative factor analysis, Piotroski F-Score (${selectedAsset.Piotroski_F ?? 'N/A'}/9), and technical signals for ${cleanTicker} (${selectedAsset.Long_Name || cleanTicker}) on the NSE.`,
        'mainEntity': {
          '@type': 'FinancialProduct',
          'name': `${selectedAsset.Long_Name || cleanTicker} (${cleanTicker})`,
          'tickerSymbol': selectedTicker,
          'exchange': 'National Stock Exchange of India',
          'category': selectedAsset.Sector || 'Equities',
          'offers': {
            '@type': 'Offer',
            'price': String(selectedAsset.Price || '0'),
            'priceCurrency': 'INR',
          },
        },
      })
    }

    scriptTag.textContent = JSON.stringify(schemas)
  }, [activeTab, selectedTicker, selectedAsset])

  return null
}
