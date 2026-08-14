import { useState } from 'react'
import { X, EnvelopeSimple, CheckCircle, Sparkle } from '@phosphor-icons/react'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function NewsletterModal({ isOpen, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !email.includes('@')) return
    setSubscribed(true)
    setTimeout(() => {
      setSubscribed(false)
      setEmail('')
      onClose()
    }, 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md card p-6 rounded-2xl shadow-2xl relative animate-scale-up" style={{ background: 'var(--surface-3)', border: '1px solid var(--border-2)' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 text-[var(--text-3)] transition-colors">
          <X size={18} />
        </button>

        {subscribed ? (
          <div className="text-center py-6 space-y-3 animate-fade-in">
            <CheckCircle size={48} weight="duotone" className="text-[var(--green)] mx-auto" />
            <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>You're Subscribed!</h3>
            <p className="text-xs" style={{ color: 'var(--text-2)' }}>
              Welcome to the Alpha Quant Research Dispatch. You will receive weekly academic factor score breakdowns and market regime updates.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full text-[var(--brand)]" style={{ background: 'var(--brand-soft)' }}>
                <EnvelopeSimple size={22} weight="duotone" />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Alpha Quant Research Dispatch</h3>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>By Alpha Research Club, FMS Delhi</p>
              </div>
            </div>

            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
              Get weekly institutional-grade factor model updates, top Piotroski F-Score picks, and India market regime shifts delivered straight to your inbox. 100% free & research-backed.
            </p>

            <div className="space-y-2">
              <input
                type="email"
                required
                placeholder="Enter your institutional or personal email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="glass-input w-full text-xs py-2.5 px-4 rounded-full"
              />
              <button type="submit" className="w-full btn-primary text-xs py-2.5 rounded-full font-semibold flex items-center justify-center gap-2">
                <Sparkle size={15} weight="fill" /> Join 2,500+ Quant Researchers & Traders
              </button>
            </div>

            <p className="text-[10px] text-center" style={{ color: 'var(--text-3)' }}>
              No spam ever. Unsubscribe anytime with 1-click. Educational purposes only.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
