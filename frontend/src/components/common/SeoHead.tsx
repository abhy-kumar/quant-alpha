import { useEffect } from 'react'
import type { DashboardData } from '../../types'

interface SeoHeadProps {
  activeTab: 'charting' | 'picks' | 'fundamentals' | 'heatmap' | 'quantlab'
  selectedTicker?: string
  selectedAsset?: DashboardData | null
}

const TAB_SEO: Record<string, { title: string; description: string; path: string }> = {
  charting: {
    title: 'Interactive Technical Charts & Quantitative Analysis | Alpha Quant NSE',
    description: 'Real-time interactive charting for 150 NSE stocks with Wilder RSI, MACD, Moving Average overlays, and factor score breakdowns.',
    path: '/',
  },
  picks: {
    title: 'Top Quantitative Stock Signals & High Conviction Picks | Alpha Quant NSE',
    description: 'Daily high-conviction NSE stock recommendations computed across 10 academic research factor models including Piotroski F-Score and Momentum.',
    path: '/signals',
  },
  fundamentals: {
    title: '150 NSE Stock Quantitative Screener & Piotroski F-Score | Alpha Quant',
    description: 'Filter top NSE Indian stocks by Piotroski F-Score, Value, Momentum, Gross Profitability, Beta, and Earnings Quality.',
    path: '/screen',
  },
  heatmap: {
    title: 'NSE Sector Heatmap & Market Breadth Analysis | Alpha Quant',
    description: 'Visual sector performance heatmap and market regime analysis for Indian stock markets across 150 top liquid equities.',
    path: '/heatmap',
  },
  quantlab: {
    title: 'Quant Lab & Strategy Backtesting Performance | Alpha Quant',
    description: 'Institutional backtesting lab tracking factor model win rates, Sharpe ratios, maximum drawdowns, and 1-year historical equity curves.',
    path: '/quant',
  },
}

export function SeoHead({ activeTab, selectedTicker, selectedAsset }: SeoHeadProps) {
  useEffect(() => {
    const config = TAB_SEO[activeTab] || TAB_SEO.charting
    let pageTitle = config.title
    let pageDesc = config.description
    const canonicalUrl = `https://quant-alpha-sage.vercel.app${config.path}`

    if (selectedTicker && selectedAsset && activeTab === 'charting') {
      const cleanTicker = selectedTicker.replace('.NS', '')
      const priceStr = selectedAsset.Price ? `₹${selectedAsset.Price.toLocaleString('en-IN')}` : ''
      const chgStr = selectedAsset['1d_Chg_%'] != null ? ` (${selectedAsset['1d_Chg_%'] >= 0 ? '+' : ''}${selectedAsset['1d_Chg_%'].toFixed(2)}%)` : ''
      pageTitle = `${cleanTicker} ${priceStr}${chgStr} Stock Chart & Quant Analysis | Alpha NSE`
      pageDesc = `Detailed quantitative research, Piotroski F-Score, and technical signals for ${cleanTicker} (${selectedAsset.Long_Name || cleanTicker}). ${pageDesc}`
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

    // 6. Inject Dynamic BreadcrumbList JSON-LD
    let scriptTag = document.getElementById('dynamic-seo-ldjson')
    if (!scriptTag) {
      scriptTag = document.createElement('script')
      scriptTag.id = 'dynamic-seo-ldjson'
      scriptTag.setAttribute('type', 'application/ld+json')
      document.head.appendChild(scriptTag)
    }

    const breadcrumbSchema = {
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
          'name': activeTab.toUpperCase(),
          'item': canonicalUrl,
        },
      ],
    }

    scriptTag.textContent = JSON.stringify(breadcrumbSchema)
  }, [activeTab, selectedTicker, selectedAsset])

  return null
}
