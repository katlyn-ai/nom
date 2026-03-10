'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const STORAGE_KEY = 'nom_onboarding_v1'
const TOOLTIP_W = 296
const TOOLTIP_H = 170 // approximate for layout
const GAP = 14
const SPOT_PAD = 6

type TipPos = 'top' | 'bottom' | 'left' | 'right'

type Step = {
  id: string
  title: string
  body: string
  target?: string   // data-tour value on the element to highlight
  page?: string     // pathname to navigate to before showing this step
  tip?: TipPos
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: '👋 Welcome to NOM!',
    body: "You're about to have the most organised kitchen on the block. Let's take a 1-minute tour to show you the ropes.",
  },
  {
    id: 'settings',
    title: 'First — set up your household',
    body: "Head to Settings to tell NOM who you're cooking for, dietary preferences, and how many meals to plan each week. The AI uses all of this.",
    target: 'nav-settings',
    tip: 'right',
  },
  {
    id: 'pantry',
    title: 'Track what you already have',
    body: "Add items you have at home to your Pantry. NOM will prioritise using them in meal suggestions and automatically skip them on your shopping list.",
    target: 'nav-pantry',
    tip: 'right',
  },
  {
    id: 'meals',
    title: 'Generate your meal plan',
    body: 'Click "Generate meals" for a personalised week of AI suggestions. Use Filters to narrow by cuisine, protein type, or max cooking time.',
    target: 'generate-meals-btn',
    page: '/meals',
    tip: 'bottom',
  },
  {
    id: 'week-grid',
    title: 'Fill your week — your way',
    body: 'Click a suggestion chip to drop it into the next free slot, or type directly into any slot. Use the copy icon on a filled meal to reuse it as leftovers.',
    target: 'week-grid',
    page: '/meals',
    tip: 'top',
  },
  {
    id: 'shopping',
    title: 'Your shopping list awaits',
    body: 'Once your week is planned, go to Shopping and tap "From meals" — NOM generates your list automatically with pantry items already excluded.',
    target: 'nav-shopping',
    tip: 'right',
  },
]

function getStored(): number | 'done' {
  if (typeof window === 'undefined') return 'done'
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'done') return 'done'
  if (v === null) return 0
  const n = parseInt(v)
  return isNaN(n) ? 0 : Math.min(n, STEPS.length - 1)
}

function setStored(v: number | 'done') {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, v === 'done' ? 'done' : String(v))
}

export function resetTour() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

export default function OnboardingTour() {
  const pathname = usePathname()
  const router = useRouter()
  const [step, setStep] = useState<number | 'done'>('done')
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setStep(getStored())
    setMounted(true)
  }, [])

  const measureTarget = useCallback(() => {
    if (typeof step !== 'number') return
    const s = STEPS[step]
    if (!s?.target) { setRect(null); return }
    const el = document.querySelector(`[data-tour="${s.target}"]`)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [step])

  useEffect(() => {
    const t = setTimeout(measureTarget, 150)
    return () => clearTimeout(t)
  }, [measureTarget, pathname])

  useEffect(() => {
    window.addEventListener('resize', measureTarget)
    return () => window.removeEventListener('resize', measureTarget)
  }, [measureTarget])

  if (!mounted || step === 'done') return null
  const current = STEPS[step]
  if (!current) return null

  const isLast = step === STEPS.length - 1

  const handleNext = () => {
    const next = step + 1
    if (next >= STEPS.length) {
      setStored('done'); setStep('done'); return
    }
    const nextStep = STEPS[next]
    setStored(next); setStep(next)
    if (nextStep.page && pathname !== nextStep.page) {
      router.push(nextStep.page)
    }
  }

  const handleSkip = () => { setStored('done'); setStep('done') }

  // --- Tooltip positioning ---
  let cardStyle: React.CSSProperties = {
    position: 'fixed',
    width: TOOLTIP_W,
    zIndex: 9999,
  }
  let arrowStyle: React.CSSProperties | null = null

  if (rect) {
    const tip = current.tip || 'bottom'
    const clampY = (v: number) => Math.max(8, Math.min(v, (typeof window !== 'undefined' ? window.innerHeight : 800) - TOOLTIP_H - 8))
    const clampX = (v: number) => Math.max(8, Math.min(v, (typeof window !== 'undefined' ? window.innerWidth : 1200) - TOOLTIP_W - 8))
    const rectCenterX = rect.left + rect.width / 2
    const rectCenterY = rect.top + rect.height / 2

    const base: React.CSSProperties = { position: 'absolute', width: 12, height: 12, background: 'var(--card)' }

    switch (tip) {
      case 'right': {
        const top = clampY(rectCenterY - TOOLTIP_H / 2)
        cardStyle = { ...cardStyle, top, left: clampX(rect.right + GAP) }
        const arrowTop = rectCenterY - top - 6
        arrowStyle = { ...base, top: arrowTop, left: -6, transform: 'rotate(45deg)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }
        break
      }
      case 'left': {
        const top = clampY(rectCenterY - TOOLTIP_H / 2)
        cardStyle = { ...cardStyle, top, left: clampX(rect.left - TOOLTIP_W - GAP) }
        const arrowTop = rectCenterY - top - 6
        arrowStyle = { ...base, top: arrowTop, right: -6, transform: 'rotate(45deg)', borderRight: '1px solid var(--border)', borderTop: '1px solid var(--border)' }
        break
      }
      case 'bottom': {
        const left = clampX(rectCenterX - TOOLTIP_W / 2)
        cardStyle = { ...cardStyle, top: Math.min(rect.bottom + GAP, (typeof window !== 'undefined' ? window.innerHeight : 800) - TOOLTIP_H - 8), left }
        const arrowLeft = rectCenterX - left - 6
        arrowStyle = { ...base, top: -6, left: arrowLeft, transform: 'rotate(45deg)', borderTop: '1px solid var(--border)', borderLeft: '1px solid var(--border)' }
        break
      }
      case 'top': {
        const left = clampX(rectCenterX - TOOLTIP_W / 2)
        cardStyle = { ...cardStyle, top: Math.max(8, rect.top - TOOLTIP_H - GAP), left }
        const arrowLeft = rectCenterX - left - 6
        arrowStyle = { ...base, bottom: -6, left: arrowLeft, transform: 'rotate(45deg)', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }
        break
      }
    }
  } else {
    // Centered (no target or element not found)
    cardStyle = { ...cardStyle, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  return (
    <>
      {/* Spotlight overlay */}
      {rect ? (
        <div
          style={{
            position: 'fixed',
            top: rect.top - SPOT_PAD,
            left: rect.left - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
            borderRadius: 14,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.52)',
            zIndex: 9998,
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9998, pointerEvents: 'none' }} />
      )}

      {/* Tooltip card */}
      <div style={cardStyle}>
        <div
          className="rounded-2xl p-5 relative"
          style={{ background: 'var(--card)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', border: '1px solid var(--border)' }}
        >
          {arrowStyle && <div style={{ position: 'absolute', ...arrowStyle }} />}

          {/* Progress dots */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === step ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    background: i === step
                      ? 'var(--primary)'
                      : i < step
                      ? 'var(--primary-light)'
                      : 'var(--border)',
                    transition: 'all 0.25s',
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleSkip}
              className="text-xs hover:opacity-60 transition-opacity"
              style={{ color: 'var(--muted)' }}
            >
              Skip tour
            </button>
          </div>

          <p className="font-semibold text-sm mb-1.5" style={{ color: 'var(--foreground)' }}>
            {current.title}
          </p>
          <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
            {current.body}
          </p>

          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--border)' }}>
              {step + 1} / {STEPS.length}
            </span>
            <button
              onClick={handleNext}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-95"
              style={{ background: 'var(--gradient-primary)' }}
            >
              {isLast ? '🎉 Done' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
