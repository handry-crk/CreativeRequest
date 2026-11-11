import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Eye } from 'lucide-react'
import { api, useApp, useLoad } from '../lib.jsx'
import { Btn, ErrorBox, Field, Mascot, Scribble, spring } from '../ui.jsx'

const EMOJIS = ['🙂', '😎', '🤩', '🧑‍🎨', '🧑‍💻', '🧑‍🍳', '🦊', '🐯', '🐼', '🌶️', '🧀', '🔥']
const COLORS = ['#D7191F', '#F2A541', '#F5B800', '#2E7D4F', '#1D4ED8', '#7A5AF8', '#BE185D', '#1F1A1A']

function PinInput({ value, onChange, autoFocus }) {
  return (
    <input
      className="input text-center tracking-[0.6em] font-display font-extrabold text-2xl" inputMode="numeric" autoComplete="off"
      maxLength={6} value={value} autoFocus={autoFocus} placeholder="••••••"
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} type="password" aria-label="PIN 6 angka"
    />
  )
}

export default function Login() {
  const { signIn, enterGuest, settings } = useApp()
  const nav = useNavigate()
  const loc = useLocation()
  const { data: names } = useLoad(() => api('/auth/names'))
  const [mode, setMode] = useState('masuk')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [f, setF] = useState({ userId: '', pin: '', name: '', division: '', jobTitle: '', email: '', emoji: EMOJIS[0], color: COLORS[0] })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }))

  const done = (res) => { signIn(res); nav(loc.state?.from || '/', { replace: true }) }
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      if (mode === 'masuk') done(await api('/auth/login', { method: 'POST', body: { userId: f.userId, pin: f.pin } }))
      else done(await api('/auth/register', { method: 'POST', body: { name: f.name, division: f.division, jobTitle: f.jobTitle, email: f.email, pin: f.pin, avatar: { color: f.color, emoji: f.emoji } } }))
    } catch (err) { setError(err) }
    setBusy(false)
  }

  return (
    <div className="min-h-dvh grid md:grid-cols-2">
      <div className="relative bg-brand-orange text-brand-char border-b-2 md:border-b-0 md:border-r-2 border-ink px-6 py-8 md:p-12 flex flex-col justify-between overflow-hidden">
        <div>
          <motion.div initial={{ rotate: -6, scale: 0.8, opacity: 0 }} animate={{ rotate: -3, scale: 1, opacity: 1 }} className="sticker bg-brand-sun mb-4">CRK Group · Tim Creative</motion.div>
          <h1 className="title-xl text-[clamp(3rem,11vw,7rem)]">
            {['Creative', 'Request'].map((w, wi) => (
              <span key={w} className="block">
                {w.split('').map((ch, i) => (
                  <motion.span key={i} className="inline-block" initial={{ y: -60, opacity: 0, rotate: -10 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ ...spring, delay: (wi * 8 + i) * 0.03 }}>{ch}</motion.span>
                ))}
              </span>
            ))}
          </h1>
          <Scribble className="w-56 h-3 mt-1" />
          <p className="mt-4 font-semibold text-base md:text-lg max-w-md">Satu pintu untuk semua permintaan desain. Brief lengkap, antrean jelas, hasil rapi.</p>
        </div>
        <div className="hidden md:flex items-end gap-4 mt-8">
          <Mascot mood="semangat" size={150} />
          <motion.div initial={{ scale: 0, rotate: 8 }} animate={{ scale: 1, rotate: 3 }} transition={{ ...spring, delay: 0.6 }} className="card bg-card px-4 py-3 mb-10 font-bold text-ink">Request lewat chat?<br />Lewat sini aja ya!</motion.div>
        </div>
        <div className="checker absolute bottom-0 inset-x-0 h-3 border-t-2 border-ink" />
      </div>

      <div className="flex items-center justify-center p-5 md:p-12">
        <div className="w-full max-w-md">
          <div className="flex gap-2 mb-5">
            {[['masuk', 'Masuk'], ['daftar', 'Daftar baru']].map(([k, label]) => (
              <button key={k} onClick={() => { setMode(k); setError(null) }} className={`relative flex-1 min-h-[46px] rounded-xl border-2 border-ink font-display font-extrabold ${mode === k ? 'text-white' : 'bg-card'}`}>
                {mode === k && <motion.span layoutId="tab" className="absolute inset-0 bg-brand rounded-[10px]" />}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.form key={mode} onSubmit={submit} className="card p-5 space-y-4" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
              {mode === 'masuk' ? (
                <>
                  <Field label="Nama">
                    <select className="input" value={f.userId} onChange={set('userId')} required>
                      <option value="">Pilih nama…</option>
                      {(names || []).map((n) => <option key={n.id} value={n.id}>{n.name} · {n.division}</option>)}
                    </select>
                  </Field>
                  <Field label="PIN"><PinInput value={f.pin} onChange={set('pin')} /></Field>
                </>
              ) : (
                <>
                  <Field label="Nama lengkap" required><input className="input" value={f.name} onChange={set('name')} required minLength={2} /></Field>
                  <Field label="Divisi" required>
                    <select className="input" value={f.division} onChange={set('division')} required>
                      <option value="">Pilih divisi…</option>
                      {settings.divisions.map((d) => <option key={d.name} value={d.name}>{d.emoji} {d.name}</option>)}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Jabatan"><input className="input" value={f.jobTitle} onChange={set('jobTitle')} /></Field>
                    <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
                  </div>
                  <div>
                    <span className="label">Avatar</span>
                    <div className="flex items-center gap-3">
                      <span className="w-14 h-14 rounded-full border-2 border-ink flex items-center justify-center text-2xl shrink-0" style={{ background: f.color }}>{f.emoji}</span>
                      <div className="space-y-2 min-w-0">
                        <div className="flex gap-1.5 flex-wrap">{EMOJIS.map((e) => <button type="button" key={e} onClick={() => set('emoji')(e)} className={`w-9 h-9 rounded-lg border-2 ${f.emoji === e ? 'border-ink bg-brand-sun' : 'border-transparent'}`}>{e}</button>)}</div>
                        <div className="flex gap-1.5 flex-wrap">{COLORS.map((c) => <button type="button" key={c} onClick={() => set('color')(c)} aria-label={`Warna ${c}`} className={`w-7 h-7 rounded-full border-2 border-ink ${f.color === c ? 'ring-4 ring-brand-sun' : ''}`} style={{ background: c }} />)}</div>
                      </div>
                    </div>
                  </div>
                  <Field label="Buat PIN (6 angka)" required hint="PIN dipakai setiap masuk. Jangan dibagikan."><PinInput value={f.pin} onChange={set('pin')} /></Field>
                </>
              )}
              <ErrorBox error={error} />
              <Btn kind="primary" className="w-full !min-h-[52px] font-display text-lg" disabled={busy || f.pin.length !== 6}>{busy ? 'Sebentar…' : mode === 'masuk' ? 'Masuk' : 'Daftar & masuk'}</Btn>
            </motion.form>
          </AnimatePresence>
          <button onClick={() => { enterGuest(); nav('/') }} className="btn-ghost w-full mt-3"><Eye size={18} /> Lihat saja (tanpa masuk)</button>
        </div>
      </div>
    </div>
  )
}

export { EMOJIS, COLORS }
