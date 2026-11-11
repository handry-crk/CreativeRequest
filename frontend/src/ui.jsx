import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useInView } from 'framer-motion'
import { Flame, X } from 'lucide-react'
import { STATUS_STYLE, useApp } from './lib.jsx'

export const spring = { type: 'spring', stiffness: 400, damping: 30 }

// ------------------------------------------------------------ maskot (karakter pengganti)
const MOODS = {
  senang: { mouth: 'M38 66 Q50 76 62 66', brow: 0, eye: 0 },
  semangat: { mouth: 'M36 64 Q50 82 64 64 Z', brow: -2, eye: 0 },
  bingung: { mouth: 'M40 70 Q46 64 52 70 T64 68', brow: 3, eye: 2 },
  panik: { mouth: 'M42 66 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0', brow: -4, eye: -2 },
  bangga: { mouth: 'M34 62 Q50 84 66 62', brow: -1, eye: 0 },
}
export function Mascot({ mood = 'senang', size = 96, className = '' }) {
  const m = MOODS[mood] || MOODS.senang
  return (
    <motion.svg
      viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true"
      animate={{ y: [0, -4, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <ellipse cx="50" cy="94" rx="26" ry="4" fill="rgb(var(--ink) / .15)" />
      <motion.path
        d="M50 10 C78 10 92 32 90 56 C88 80 72 92 50 92 C28 92 12 80 10 56 C8 32 22 10 50 10 Z"
        fill="#D7191F" stroke="#1F1A1A" strokeWidth="3"
        animate={{ scaleY: [1, 0.97, 1] }} transition={{ duration: 2.4, repeat: Infinity }} style={{ originY: 1 }}
      />
      <circle cx="36" cy="46" r="10" fill="#fff" stroke="#1F1A1A" strokeWidth="2.5" />
      <circle cx="64" cy="46" r="10" fill="#fff" stroke="#1F1A1A" strokeWidth="2.5" />
      <circle cx="38" cy={47 + m.eye} r="4.5" fill="#1F1A1A" />
      <circle cx="66" cy={47 + m.eye} r="4.5" fill="#1F1A1A" />
      <motion.path d="M26 32 L44 30" stroke="#1F1A1A" strokeWidth="3" strokeLinecap="round" animate={{ rotate: m.brow * 3 }} style={{ originX: '35px', originY: '31px' }} />
      <motion.path d="M56 30 L74 32" stroke="#1F1A1A" strokeWidth="3" strokeLinecap="round" animate={{ rotate: -m.brow * 3 }} style={{ originX: '65px', originY: '31px' }} />
      <motion.path d={m.mouth} fill={mood === 'semangat' || mood === 'panik' ? '#1F1A1A' : 'none'} stroke="#1F1A1A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" key={mood} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ originX: '50px', originY: '68px' }} />
      {mood === 'bangga' && <path d="M78 18 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" fill="#F5B800" stroke="#1F1A1A" strokeWidth="2" />}
    </motion.svg>
  )
}

// ------------------------------------------------------------ teks & angka
export function PageTitle({ children, sub, tone = 'bg-brand-orange', right }) {
  const text = String(children)
  return (
    <div className={`relative overflow-hidden rounded-3xl border-2 border-ink shadow-pop ${tone} text-brand-char px-5 py-6 md:px-8 md:py-8 mb-5`}>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="title-xl text-[clamp(2.2rem,9vw,5rem)]" aria-label={text}>
            {text.split('').map((ch, i) => (
              <motion.span
                key={i} aria-hidden="true" className="inline-block"
                initial={{ y: -40, opacity: 0, rotate: -8 }} animate={{ y: 0, opacity: 1, rotate: 0 }}
                transition={{ ...spring, delay: i * 0.02 }}
              >{ch === ' ' ? ' ' : ch}</motion.span>
            ))}
          </h1>
          {sub && <p className="mt-2 font-semibold text-[15px] md:text-base max-w-2xl">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="checker absolute left-0 right-0 bottom-0 h-2 border-t-2 border-ink" />
    </div>
  )
}

export function CountUp({ value, digits = 0, suffix = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  const [shown, setShown] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    if (!inView || value === null || value === undefined) return
    if (document.documentElement.classList.contains('reduce-motion')) { setShown(value); prev.current = value; return }
    const c = animate(prev.current, value, { duration: 0.6, ease: 'easeOut', onUpdate: (v) => setShown(v) })
    prev.current = value
    return () => c.stop()
  }, [value, inView])
  return (
    <span ref={ref} className="tabular-nums">
      {value === null || value === undefined ? '-' : Number(shown).toLocaleString('id-ID', { maximumFractionDigits: digits, minimumFractionDigits: digits }) + suffix}
    </span>
  )
}

export function Tile({ label, value, digits, suffix, tone = '', active, onClick, hint }) {
  const Tag = onClick ? motion.button : motion.div
  return (
    <Tag
      onClick={onClick} whileTap={onClick ? { scale: 0.96 } : undefined} whileHover={onClick ? { y: -3 } : undefined}
      className={`card text-left p-3 md:p-4 min-w-[120px] ${tone} ${active ? 'ring-4 ring-brand-sun' : ''}`}
    >
      <div className="font-display font-black text-4xl md:text-5xl leading-none"><CountUp value={value} digits={digits} suffix={suffix} /></div>
      <div className="mt-1.5 text-xs md:text-sm font-bold">{label}</div>
      {hint && <div className="text-[11px] opacity-70">{hint}</div>}
    </Tag>
  )
}

// ------------------------------------------------------------ chip
export function StatusChip({ status, className = '' }) {
  return (
    <motion.span
      key={status} initial={{ scale: 1.3, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={spring}
      className={`sticker ${STATUS_STYLE[status] || 'bg-card'} ${className}`}
    >{status}</motion.span>
  )
}

export function DivisionChip({ name }) {
  const { division } = useApp()
  const d = division(name)
  return (
    <span className="chip bg-card" title={d.name}>
      <span className="w-2.5 h-2.5 rounded-full border border-ink" style={{ background: d.color }} />
      {d.emoji} {d.code}
    </span>
  )
}

export function Avatar({ user, name, size = 32 }) {
  const a = user?.avatar
  const label = user?.name || name || '?'
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border-2 border-ink font-extrabold text-white shrink-0"
      style={{ width: size, height: size, background: a?.color || '#1F1A1A', fontSize: size * 0.45 }} title={label}
    >{a?.emoji || label.slice(0, 1).toUpperCase()}</span>
  )
}

export function UrgentFlame({ label = true }) {
  return (
    <span className="chip bg-brand text-white">
      <Flame size={13} className="flicker" fill="#F5B800" stroke="#F5B800" />{label && 'Urgent'}
    </span>
  )
}

export function Lives({ round = 0, max = 2, withLabel = false }) {
  return (
    <span className="inline-flex items-center gap-1" title={`Nyawa revisi tersisa: ${max - round} dari ${max}`}>
      {withLabel && <span className="text-xs font-bold mr-1">Nyawa revisi</span>}
      {Array.from({ length: max }).map((_, i) => (
        <motion.span
          key={i} className={`w-3 h-3 rounded-full border-2 border-ink ${i < max - round ? 'bg-brand' : 'bg-transparent'}`}
          animate={{ scale: i < max - round ? 1 : 0.8 }} transition={spring}
        />
      ))}
    </span>
  )
}

export function DeadlineRing({ daysLeft, overdue, atRisk, size = 40 }) {
  if (daysLeft === null || daysLeft === undefined) return null
  const r = 16
  const c = 2 * Math.PI * r
  const frac = overdue ? 1 : Math.max(0.06, Math.min(1, 1 - daysLeft / 10))
  const color = overdue ? '#D7191F' : atRisk || daysLeft <= 1 ? '#C98A1B' : '#2E7D4F'
  return (
    <span className={`relative inline-flex items-center justify-center shrink-0 ${atRisk ? 'pulse-soft' : ''}`} style={{ width: size, height: size }}
      title={overdue ? 'Lewat deadline' : `${daysLeft} hari kerja lagi`}>
      <svg viewBox="0 0 40 40" width={size} height={size} className="-rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgb(var(--ink) / .12)" strokeWidth="5" />
        <motion.circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - frac) }} transition={{ duration: 0.6, ease: 'easeOut' }} />
      </svg>
      <span className="absolute font-extrabold" style={{ color, fontSize: size * 0.26 }}>{overdue ? '!' : daysLeft === 0 ? 'H' : `H-${daysLeft}`}</span>
    </span>
  )
}

// ------------------------------------------------------------ wadah
export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return
    const fn = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-brand-char/60 p-0 md:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className={`card w-full ${wide ? 'md:max-w-3xl' : 'md:max-w-lg'} max-h-[92dvh] overflow-y-auto rounded-b-none md:rounded-b-2xl`}
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={spring}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-card z-10 flex items-center justify-between gap-3 px-4 py-3 border-b-2 border-ink">
              <h2 className="font-display font-extrabold text-lg">{title}</h2>
              <button className="btn-ghost !min-h-[40px] !px-2" onClick={onClose} aria-label="Tutup"><X size={20} /></button>
            </div>
            <div className="p-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Empty({ mood = 'senang', title, children }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4">
      <Mascot mood={mood} size={110} />
      <p className="mt-3 font-display font-extrabold text-xl">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  )
}

export function Skeleton({ rows = 3, h = 'h-20' }) {
  return <div className="space-y-3">{Array.from({ length: rows }).map((_, i) => <div key={i} className={`shimmer rounded-2xl ${h}`} />)}</div>
}

export function Btn({ kind = 'default', className = '', children, ...p }) {
  const cls = kind === 'primary' ? 'btn-primary' : kind === 'sun' ? 'btn-sun' : kind === 'ghost' ? 'btn-ghost' : 'btn'
  return (
    <motion.button whileTap={{ scale: 0.96 }} whileHover={kind === 'ghost' ? undefined : { y: -2 }} className={`${cls} ${className}`} {...p}>
      {children}
    </motion.button>
  )
}

export function Field({ label, hint, error, children, required, group }) {
  const Tag = group ? motion.div : motion.label
  return (
    <Tag className="block" animate={error ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.35 }}>
      {label && <span className="label">{label}{required && <span className="text-brand"> *</span>}</span>}
      {children}
      {hint && <span className="block mt-1 text-xs text-muted">{hint}</span>}
    </Tag>
  )
}

export function ErrorBox({ error }) {
  if (!error) return null
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border-2 border-brand bg-brand-tint text-brand-char p-3 text-sm" role="alert">
      <p className="font-bold">{error.message}</p>
      {error.missing?.length > 0 && <ul className="mt-1 list-disc pl-5">{error.missing.map((m) => <li key={m}>{m}</li>)}</ul>}
    </motion.div>
  )
}

export function Scribble({ className = '' }) {
  return (
    <svg viewBox="0 0 200 12" className={className} preserveAspectRatio="none" aria-hidden="true">
      <motion.path d="M2 8 C40 2 70 11 100 6 S160 3 198 7" fill="none" stroke="#D7191F" strokeWidth="4" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.3 }} />
    </svg>
  )
}
