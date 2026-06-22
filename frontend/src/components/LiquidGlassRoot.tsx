import { useRef, useEffect, useCallback, useState } from 'react'
import { LiquidGlass } from '@ybouane/liquidglass'
import type { GlassConfig } from '@ybouane/liquidglass'

interface LiquidGlassRootProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  defaults?: Partial<GlassConfig>
}

interface LiquidGlassInstance {
  destroy(): void
  markChanged(element?: HTMLElement): void
}

export function LiquidGlassRoot({ children, className, style, defaults }: LiquidGlassRootProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<LiquidGlassInstance | null>(null)
  const [ready, setReady] = useState(false)

  const initGlass = useCallback(async () => {
    const root = rootRef.current
    if (!root) return

    if (instanceRef.current) {
      instanceRef.current.destroy()
      instanceRef.current = null
      setReady(false)
    }

    const glassElements = root.querySelectorAll<HTMLElement>('[data-glass]')
    if (glassElements.length === 0) return

    try {
      instanceRef.current = await LiquidGlass.init({
        root,
        glassElements,
        defaults: {
          blurAmount: 0.2,
          refraction: 0.4,
          chromAberration: 0.02,
          edgeHighlight: 0.05,
          specular: 0.1,
          fresnel: 0.6,
          cornerRadius: 0,
          zRadius: 20,
          brightness: 0,
          saturation: 0,
          shadowOpacity: 0.15,
          opacity: 1,
          tintStrength: 0,
          shadowSpread: 8,
          shadowOffsetY: 4,
          floating: false,
          button: false,
          bevelMode: 0,
          ...defaults,
        },
      })
      setReady(true)
    } catch (e) {
      console.warn('[LiquidGlass] Init failed, falling back to CSS glass:', e)
    }
  }, [defaults])

  useEffect(() => {
    const timer = setTimeout(initGlass, 150)
    return () => {
      clearTimeout(timer)
      if (instanceRef.current) {
        instanceRef.current.destroy()
        instanceRef.current = null
      }
    }
  }, [initGlass])

  return (
    <div
      ref={rootRef}
      className={`${className || ''} ${ready ? 'liquid-glass-ready' : ''}`}
      style={{ position: 'relative', ...style }}
    >
      {children}
    </div>
  )
}
