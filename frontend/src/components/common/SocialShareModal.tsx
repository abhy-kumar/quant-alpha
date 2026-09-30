import { useState } from 'react'
import { ModalShell } from './ModalShell'
import { X, Copy, Check, ShareNetwork, WhatsappLogo, TwitterLogo, LinkedinLogo, PaperPlaneTilt } from '@phosphor-icons/react'
import type { DashboardData } from '../../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  asset?: DashboardData | null
  title?: string
}

export function SocialShareModal({ isOpen, onClose, asset, title }: Props) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const ticker = asset ? asset.Ticker.replace('.NS', '') : 'NSE Stock'
  const price = asset?.Price ? `₹${asset.Price.toLocaleString('en-IN')}` : ''
  const score = asset?.Composite_Score != null ? `${asset.Composite_Score.toFixed(1)}/10` : ''
  const conv = asset?.Conviction || 'Analysis'

  const shareTitle = title || `Alpha Quant Analysis for ${ticker}`
  const shareText = asset
    ? `${ticker} (${asset.Long_Name || ticker}). ${price ? `Price: ${price}. ` : ''}${score ? `Research score: ${score} (${conv}). ` : ''}View the company chart and research on Alpha Quant.`
    : 'NSE stock charts, company fundamentals, and quantitative research on Alpha Quant.'

  const shareUrl = asset
    ? `https://quant-alpha-sage.vercel.app/?ticker=${encodeURIComponent(ticker)}`
    : `https://quant-alpha-sage.vercel.app/`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        })
      } catch {}
    }
  }

  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`
  const twUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}&hashtags=NSE,QuantFinance,StockMarketIndia`
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`

  return (
    <ModalShell title="Share research" onClose={onClose} className="max-w-md p-5 sm:p-6" overlayClassName="">
        <button type="button" aria-label="Close dialog" onClick={onClose} className="icon-button absolute top-4 right-4">
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4 pr-10">
          <div className="p-2.5 rounded-xl text-[var(--brand)]" style={{ background: 'var(--brand-soft)' }}>
            <ShareNetwork size={22} weight="regular" />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Share research</h3>
            <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>Send a link to this research</p>
          </div>
        </div>

        {asset && (
          <div className="p-3.5 rounded-xl mb-4 text-xs font-mono" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <div className="flex items-center justify-between mb-1 font-semibold" style={{ color: 'var(--text)' }}>
              <span>{ticker}</span>
              <span style={{ color: 'var(--brand)' }}>{score ? `Score: ${score}` : 'Score unavailable'}</span>
            </div>
            <p className="text-[12px] font-sans line-clamp-2" style={{ color: 'var(--text-2)' }}>{shareText}</p>
          </div>
        )}

        <div className="grid grid-cols-4 gap-3 mb-5 text-center">
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-[var(--surface-3)] transition-colors" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
            <WhatsappLogo size={24} weight="fill" />
            <span className="text-[12px] font-medium">WhatsApp</span>
          </a>

          <a href={twUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-[var(--surface-3)] transition-colors" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
            <TwitterLogo size={24} weight="fill" />
            <span className="text-[12px] font-medium">X / Twitter</span>
          </a>

          <a href={liUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-[var(--surface-3)] transition-colors" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
            <LinkedinLogo size={24} weight="fill" />
            <span className="text-[12px] font-medium">LinkedIn</span>
          </a>

          <a href={tgUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-[var(--surface-3)] transition-colors" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
            <PaperPlaneTilt size={24} weight="fill" />
            <span className="text-[12px] font-medium">Telegram</span>
          </a>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <input aria-label="Share link" type="text" readOnly value={shareUrl} className="bg-transparent text-xs font-mono flex-1 outline-none px-2 text-[var(--text-2)]" />
            <button onClick={handleCopy} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

          {'share' in navigator && (
            <button onClick={handleNativeShare} className="w-full btn-glass text-xs py-2 flex items-center justify-center gap-2">
              <ShareNetwork size={14} /> Share via Device Apps
            </button>
          )}
        </div>
    </ModalShell>
  )
}
