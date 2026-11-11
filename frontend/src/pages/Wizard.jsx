import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Clapperboard, FileText, Flag, Flame, Image as ImageIcon, Link2,
  Package, Plus, Presentation, Rocket, Scaling, Sparkles, Ticket, Trash2, Upload, Utensils,
} from 'lucide-react'
import { MONTHS_ID, api, blip, celebrate, fileUrl, fmtDate, parseYmd, uploadImage, useApp, ymd } from '../lib.jsx'
import { Btn, ErrorBox, Field, Mascot, Skeleton, spring } from '../ui.jsx'

const ICONS = { image: ImageIcon, ticket: Ticket, flag: Flag, utensils: Utensils, package: Package, clapperboard: Clapperboard, presentation: Presentation, 'file-text': FileText, scaling: Scaling, sparkles: Sparkles }
const STEPS = ['Mau bikin apa?', 'Buat siapa & untuk apa?', 'Teks & bahan', 'Ukuran & format', 'Cek sekali lagi']
const FORMATS = ['png', 'jpg', 'pdf', 'ai', 'psd', 'mp4', 'pptx', 'docx']
const EMPTY = {
  title: '', type: '', media: '', brand: 'Cimol Bojot AA', outlet: '', neededDate: '', purpose: '', objective: '', audience: '',
  references: [], copy: { headline: '', subHeadline: '', body: '', terms: '' }, copyFinal: false, copyApprovedBy: '', copywriter: '',
  assetLink: '', useBrandAssets: false, outputs: [], notes: '', urgentReason: '',
}

function checksOf(b) {
  return {
    title: !!b.title.trim(), type: !!b.type, media: ['Digital', 'Cetak'].includes(b.media), neededDate: !!b.neededDate,
    purpose: !!b.purpose.trim(), objective: !!b.objective.trim(), audience: !!b.audience.trim(), references: b.references.length > 0,
    headline: !!b.copy.headline?.trim(), copyFinal: !!b.copyFinal, copyApprovedBy: !!b.copyApprovedBy.trim(),
    asset: !!b.assetLink.trim() || b.useBrandAssets,
    outputs: b.outputs.length > 0 && b.outputs.every((o) => o.name?.trim() && o.size?.trim() && o.fileFormat),
  }
}
const STEP_KEYS = [['type', 'title', 'media', 'neededDate'], ['purpose', 'objective', 'audience', 'references'], ['headline', 'copyFinal', 'copyApprovedBy', 'asset'], ['outputs']]

// ------------------------------------------------------------ Brief Meter: mangkuk terisi cimol
function BriefMeter({ done, total, mood, compact }) {
  const spots = useMemo(() => Array.from({ length: total }).map((_, i) => {
    const row = Math.floor(i / 5)
    const col = i % 5
    return { x: 26 + col * 15 + (row % 2) * 7, y: 50 - row * 12 }
  }), [total])
  const full = done === total
  const bowl = (
    <motion.svg viewBox="0 0 120 110" className={compact ? 'w-14 h-12' : 'w-40 h-36'} animate={full ? { y: [0, -8, 0] } : { y: 0 }} transition={{ duration: 0.5 }} aria-hidden="true">
      <AnimatePresence>
        {spots.slice(0, done).map((s, i) => (
          <motion.circle key={i} cx={s.x} r="7.5" fill="#F5B800" stroke="#1F1A1A" strokeWidth="2"
            initial={{ cy: -10, opacity: 0 }} animate={{ cy: s.y, opacity: 1 }} exit={{ opacity: 0, scale: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} />
        ))}
      </AnimatePresence>
      <path d="M12 58 H108 C108 86 88 104 60 104 C32 104 12 86 12 58 Z" fill="#D7191F" stroke="#1F1A1A" strokeWidth="3" fillOpacity="0.92" />
      <path d="M8 58 H112" stroke="#1F1A1A" strokeWidth="4" strokeLinecap="round" />
      <path d="M26 74 q10 -8 20 0 t20 0 t20 0" fill="none" stroke="#FFF4E0" strokeWidth="2.5" strokeLinecap="round" />
    </motion.svg>
  )
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {bowl}
        <div className="font-display font-black text-lg leading-none">{Math.round((done / total) * 100)}%<div className="text-[10px] font-bold font-sans">Brief Meter</div></div>
      </div>
    )
  }
  return (
    <div className="card p-4 text-center sticky top-6">
      <div className="sticker bg-brand-sun text-brand-char mb-2">Brief Meter</div>
      <div className="flex items-end justify-center gap-1">{bowl}<Mascot mood={mood} size={74} /></div>
      <div className="font-display font-black text-4xl">{Math.round((done / total) * 100)}%</div>
      <p className="text-sm font-semibold text-muted">{full ? 'Lengkap! Siap diluncurkan.' : `${total - done} hal lagi supaya brief langsung diterima.`}</p>
    </div>
  )
}

// ------------------------------------------------------------ kalender dengan tanda dadakan
function Calendar({ value, onChange, earliest, today, settings }) {
  const init = value ? parseYmd(value) : earliest ? parseYmd(earliest) : parseYmd(today)
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() })
  const first = new Date(view.y, view.m, 1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(view.y, view.m + 1, 0).getDate()
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const shift = (n) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  return (
    <div className="card p-3 !shadow-pop-sm">
      <div className="flex items-center justify-between mb-2">
        <button type="button" className="btn-ghost !min-h-[40px] !px-2" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><ChevronLeft size={18} /></button>
        <div className="font-display font-extrabold">{MONTHS_ID[view.m]} {view.y}</div>
        <button type="button" className="btn-ghost !min-h-[40px] !px-2" onClick={() => shift(1)} aria-label="Bulan berikutnya"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted mb-1">{['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const date = new Date(view.y, view.m, d)
          const s = ymd(date)
          const dow = date.getDay() === 0 ? 7 : date.getDay()
          const off = s < today || !settings.workDays.includes(dow) || settings.holidays.includes(s)
          const hot = !off && earliest && s < earliest
          const safe = s === earliest
          const sel = s === value
          return (
            <motion.button type="button" key={i} disabled={off} whileTap={{ scale: 0.9 }} onClick={() => onChange(s)}
              className={`relative h-10 rounded-lg text-sm font-bold ${off ? 'text-muted/40' : sel ? 'bg-brand text-white border-2 border-ink' : hot ? 'bg-brand-tint text-brand-char' : 'hover:bg-brand-sun/50'}`}
              aria-label={`${fmtDate(s, { long: true })}${hot ? ', dadakan' : ''}`}>
              {d}
              {hot && !sel && <Flame size={10} className="absolute top-0.5 right-0.5 text-brand" fill="#D7191F" />}
              {safe && !sel && (
                <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
                  <motion.ellipse cx="20" cy="20" rx="17" ry="15" fill="none" stroke="#2E7D4F" strokeWidth="2.5" strokeLinecap="round" transform="rotate(-8 20 20)"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5 }} />
                </svg>
              )}
            </motion.button>
          )
        })}
      </div>
      <div className="flex gap-3 flex-wrap mt-2 text-[11px] font-semibold text-muted">
        <span className="inline-flex items-center gap-1"><Flame size={11} className="text-brand" fill="#D7191F" /> Dadakan (urgent)</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full border-2 border-brand-green" /> Tanggal aman paling cepat</span>
      </div>
    </div>
  )
}

function Toggle({ options, value, onChange }) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <motion.button type="button" key={o} whileTap={{ scale: 0.96 }} onClick={() => onChange(o)}
          className={`flex-1 min-h-[46px] rounded-xl border-2 border-ink font-bold ${value === o ? 'bg-brand text-white shadow-pop-sm' : 'bg-card'}`}>{o}</motion.button>
      ))}
    </div>
  )
}

export default function Wizard() {
  const { id: routeId } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { settings, user } = useApp()
  const [b, setB] = useState(EMPTY)
  const [id, setId] = useState(routeId || null)
  const [loading, setLoading] = useState(!!routeId || !!params.get('dari'))
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [sla, setSla] = useState(null)
  const [shake, setShake] = useState(0)
  const [missing, setMissing] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  const [returned, setReturned] = useState(null)
  const [refLink, setRefLink] = useState('')
  const dirty = useRef(false)
  const idRef = useRef(id)
  idRef.current = id

  const set = (k, v) => { dirty.current = true; setB((s) => ({ ...s, [k]: v })) }
  const setCopy = (k, v) => { dirty.current = true; setB((s) => ({ ...s, copy: { ...s.copy, [k]: v } })) }

  // muat draft / duplikat
  useEffect(() => {
    const src = routeId || params.get('dari')
    if (!src) return
    api(`/requests/${src}`).then((r) => {
      if (routeId && !['Draft', 'Perlu Dilengkapi'].includes(r.status)) return nav(`/r/${r.id}`, { replace: true })
      const next = { ...EMPTY }
      Object.keys(EMPTY).forEach((k) => { if (r[k] !== undefined && r[k] !== null) next[k] = r[k] })
      next.copy = { ...EMPTY.copy, ...(r.copy || {}) }
      if (!routeId) { next.neededDate = ''; next.urgentReason = ''; next.outputs = next.outputs.map((o) => ({ ...o, fileLink: '', fileName: '', done: false })); dirty.current = true }
      else if (r.status === 'Perlu Dilengkapi') setReturned(r.briefCheck)
      setB(next); setLoading(false)
    }).catch((e) => { toast.error(e.message); nav('/saya', { replace: true }) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId])

  useEffect(() => {
    if (!b.type) return setSla(null)
    api(`/sla?type=${encodeURIComponent(b.type)}`).then(setSla).catch(() => {})
  }, [b.type])

  // simpan otomatis sebagai draft
  const save = async () => {
    if (!dirty.current) return idRef.current
    dirty.current = false
    setSaved('Menyimpan…')
    try {
      if (idRef.current) await api(`/requests/${idRef.current}`, { method: 'PUT', body: b })
      else {
        const r = await api('/requests', { method: 'POST', body: b })
        setId(r.id); idRef.current = r.id
        window.history.replaceState(null, '', `/ajukan/${r.id}`)
      }
      setSaved('Draft tersimpan')
    } catch (e) { dirty.current = true; setSaved('Gagal menyimpan'); throw e }
    return idRef.current
  }
  useEffect(() => {
    if (!dirty.current || (!b.title && !b.type)) return
    const t = setTimeout(() => { save().catch(() => {}) }, 1200)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b])

  const checks = checksOf(b)
  const done = Object.values(checks).filter(Boolean).length
  const total = Object.keys(checks).length
  const urgent = !!(sla?.earliestSafeDate && b.neededDate && b.neededDate < sla.earliestSafeDate)
  const mood = urgent ? 'panik' : done === total ? 'bangga' : done / total < 0.4 ? 'bingung' : 'semangat'
  const bad = (k) => missing.includes(k)
  const ek = (k) => `${k}-${bad(k) ? shake : 0}`

  const go = (n) => {
    if (n > step && step < 4) {
      const miss = STEP_KEYS[step].filter((k) => !checks[k])
      if (step === 0 && urgent && !b.urgentReason.trim()) miss.push('urgentReason')
      if (miss.length) { setMissing(miss); setShake((s) => s + 1); return toast.error('Masih ada yang perlu diisi di langkah ini.') }
    }
    setMissing([]); setDir(n > step ? 1 : -1); setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const addImages = async (files) => {
    const imgs = b.references.filter((r) => r.startsWith('/api/files/')).length
    const list = Array.from(files).slice(0, Math.max(0, 3 - imgs))
    if (!list.length) return toast.error('Maksimal 3 gambar referensi.')
    try {
      const urls = []
      for (const f of list) urls.push(await uploadImage(f, 300))
      set('references', [...b.references, ...urls])
    } catch (e) { toast.error(e.message) }
  }
  const addLink = () => {
    const v = refLink.trim()
    if (!v) return
    set('references', [...b.references, /^https?:\/\//.test(v) ? v : 'https://' + v]); setRefLink('')
  }
  const addOutput = (p) => set('outputs', [...b.outputs, p
    ? { name: p.name, size: p.size, unit: p.unit, orientation: p.w > p.h ? 'Landscape' : 'Portrait', fileFormat: b.media === 'Cetak' ? 'pdf' : 'png' }
    : { name: '', size: '', unit: 'px', orientation: 'Portrait', fileFormat: b.media === 'Cetak' ? 'pdf' : 'png' }])
  const editOutput = (i, k, v) => set('outputs', b.outputs.map((o, j) => (j === i ? { ...o, [k]: v } : o)))

  const submit = async (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setBusy(true); setError(null)
    try {
      dirty.current = true
      const rid = await save()
      const r = await api(`/requests/${rid}/submit`, { method: 'POST' })
      celebrate('small', { x: (rect.left + rect.width / 2) / window.innerWidth, y: rect.top / window.innerHeight })
      blip(user?.prefs?.sound)
      if (r.status === 'Menunggu Persetujuan Urgent') toast.warning(`Brief meluncur! Kode: ${r.code}. Ini dadakan, jadi butuh persetujuan Manager dan Creative Lead dulu.`)
      else toast.success(`Brief meluncur! Kode: ${r.code}. Tim Creative akan cek dulu ya.`)
      nav(`/r/${r.id}`, { replace: true })
    } catch (err) { setError(err); setBusy(false) }
  }

  if (loading) return <Skeleton rows={4} />

  const slide = { enter: (d) => ({ x: d * 60, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d) => ({ x: d * -60, opacity: 0 }) }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h1 className="title-xl text-4xl md:text-6xl">Racik Brief</h1>
        <span className="text-xs font-bold text-muted">{saved}</span>
      </div>

      {/* progres checkerboard */}
      <div className="h-4 rounded-full border-2 border-ink bg-card overflow-hidden mb-2">
        <motion.div className="checker h-full" animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={spring} />
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-4">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => (i <= step ? go(i) : go(Math.min(i, step + 1)))} className={`shrink-0 chip ${i === step ? 'bg-brand text-white' : i < step ? 'bg-brand-sun text-brand-char' : 'bg-card text-muted'}`}>
            {i < step ? <Check size={12} strokeWidth={3} /> : i + 1} {s}
          </button>
        ))}
      </div>

      {returned?.missing?.length > 0 && (
        <div className="card !bg-brand-tint text-brand-char p-4 mb-4">
          <p className="font-display font-extrabold">Brief-nya belum lengkap nih. Ada {returned.missing.length} hal yang perlu ditambah.</p>
          <ul className="list-disc pl-5 text-sm font-semibold mt-1">{returned.missing.map((m) => <li key={m}>{m}</li>)}</ul>
          {returned.note && <p className="text-sm mt-2">Catatan {returned.by}: “{returned.note}”</p>}
        </div>
      )}

      <div className="md:hidden card p-2 px-3 mb-3 sticky top-[60px] z-20 flex items-center justify-between">
        <BriefMeter done={done} total={total} mood={mood} compact />
        <Mascot mood={mood} size={44} />
      </div>

      <div className="grid md:grid-cols-[1fr_260px] gap-5 items-start">
        <div className="card p-4 md:p-6 overflow-hidden">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={step} custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={{ duration: 0.22, ease: 'easeOut' }} className="space-y-5">
              <h2 className="font-display font-black text-2xl md:text-3xl">{step + 1}. {STEPS[step]}</h2>

              {step === 0 && (
                <>
                  <Field key={ek('type')} label="Jenis request" group required error={bad('type')}>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {settings.types.map((t) => {
                        const Icon = ICONS[t.icon] || Sparkles
                        const on = b.type === t.name
                        return (
                          <motion.button type="button" key={t.name} onClick={() => { set('type', t.name); if (t.media === 'Digital' || t.media === 'Video') set('media', 'Digital'); if (t.media === 'Cetak') set('media', 'Cetak') }}
                            whileHover={{ y: -3, rotate: -1 }} whileTap={{ scale: 0.95 }} animate={{ rotateY: on ? [0, 180, 360] : 0 }} transition={{ duration: 0.4 }}
                            className={`text-left p-3 rounded-2xl border-2 border-ink min-h-[92px] ${on ? 'bg-brand text-white shadow-pop' : 'bg-card shadow-pop-sm'}`}>
                            <Icon size={24} />
                            <div className="font-bold text-sm leading-tight mt-1.5">{t.name}</div>
                            <div className={`text-[11px] font-semibold ${on ? 'opacity-90' : 'text-muted'}`}>{t.minLeadDays != null ? `Min. ${t.minLeadDays} hari kerja` : 'Waktu ditentukan Creative Lead'}</div>
                          </motion.button>
                        )
                      })}
                    </div>
                  </Field>
                  <Field key={ek('title')} label="Judul request" required error={bad('title')} hint="Singkat dan jelas, mis. “Flyer Promo B1G1 Gajian”.">
                    <input className="input" value={b.title} onChange={(e) => set('title', e.target.value)} maxLength={80} />
                  </Field>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field key={ek('media')} label="Media" group required error={bad('media')}><Toggle options={['Digital', 'Cetak']} value={b.media} onChange={(v) => set('media', v)} /></Field>
                    <Field label="Brand">
                      <select className="input" value={b.brand} onChange={(e) => set('brand', e.target.value)}>{settings.brands.map((x) => <option key={x}>{x}</option>)}</select>
                    </Field>
                  </div>
                  {b.media === 'Cetak' && <p className="text-sm font-semibold text-brand-amber">Catatan: waktu pengerjaan belum termasuk produksi cetak di vendor.</p>}
                  <Field label="Outlet / lokasi (bila ada)"><input className="input" value={b.outlet} onChange={(e) => set('outlet', e.target.value)} /></Field>
                  <Field key={ek('neededDate')} label="Tanggal dibutuhkan" group required error={bad('neededDate')}
                    hint={sla?.earliestSafeDate ? `Tanggal aman paling cepat untuk jenis ini: ${fmtDate(sla.earliestSafeDate, { long: true })}.` : b.type ? 'Jenis ini tidak punya batas minimal; Creative Lead yang menentukan.' : 'Pilih jenis request dulu supaya tanggal aman terlihat.'}>
                    <Calendar value={b.neededDate} onChange={(v) => set('neededDate', v)} earliest={sla?.earliestSafeDate} today={sla?.today || ymd(new Date())} settings={settings} />
                  </Field>
                  <AnimatePresence>
                    {urgent && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="rounded-2xl border-2 border-brand bg-brand-tint text-brand-char p-4">
                          <p className="font-display font-extrabold flex items-center gap-2"><Flame className="flicker text-brand" fill="#D7191F" size={20} /> Wah, ini dadakan.</p>
                          <p className="text-sm font-semibold mt-1">Butuh persetujuan Manager divisi dan Creative Lead dulu sebelum masuk antrean.</p>
                          <Field key={ek('urgentReason')} label="Alasan urgent" required error={bad('urgentReason')}>
                            <textarea className="input mt-1" rows={2} value={b.urgentReason} onChange={(e) => set('urgentReason', e.target.value)} />
                          </Field>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}

              {step === 1 && (
                <>
                  <Field key={ek('purpose')} label="Tujuan" required error={bad('purpose')} hint="Contoh: promo flyer / poster / banner / voucher.">
                    <input className="input" value={b.purpose} onChange={(e) => set('purpose', e.target.value)} />
                  </Field>
                  <Field key={ek('objective')} label="Objektif" required error={bad('objective')} hint="Contoh: memberitahukan audiens promo B1G1.">
                    <textarea className="input" rows={2} value={b.objective} onChange={(e) => set('objective', e.target.value)} />
                  </Field>
                  <Field key={ek('audience')} label="Target audiens" required error={bad('audience')}>
                    <input className="input" value={b.audience} onChange={(e) => set('audience', e.target.value)} />
                  </Field>
                  <div>
                    <Field key={ek('references')} label="Referensi (minimal 1 tautan atau gambar)" required error={bad('references')}>
                      <div className="flex gap-2">
                        <input className="input" placeholder="Tempel tautan contoh desain" value={refLink} onChange={(e) => setRefLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())} />
                        <Btn type="button" onClick={addLink} aria-label="Tambah tautan"><Plus size={18} /></Btn>
                      </div>
                    </Field>
                    <label className="btn mt-2 cursor-pointer"><Upload size={18} /> Unggah gambar (maks. 3)
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addImages(e.target.files); e.target.value = '' }} />
                    </label>
                    <div className="flex gap-4 flex-wrap mt-4">
                      <AnimatePresence>
                        {b.references.map((r, i) => (
                          <motion.div key={r} layout initial={{ scale: 0, rotate: -12 }} animate={{ scale: 1, rotate: i % 2 ? 3 : -3 }} exit={{ scale: 0 }} className="relative bg-white text-brand-char border-2 border-ink shadow-pop-sm p-1.5 pb-5 w-28">
                            <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-brand border-2 border-ink" />
                            {r.startsWith('/api/files/') ? <img src={fileUrl(r)} alt={`Referensi ${i + 1}`} className="w-full h-20 object-cover" /> : (
                              <a href={r} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center h-20 bg-brand-cream text-xs font-bold text-center break-all px-1 overflow-hidden"><Link2 size={16} />{r.replace(/^https?:\/\//, '').slice(0, 28)}</a>
                            )}
                            <button type="button" onClick={() => set('references', b.references.filter((x) => x !== r))} className="absolute bottom-0 right-0.5 p-1" aria-label="Hapus referensi"><Trash2 size={13} /></button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <div className="grid lg:grid-cols-2 gap-5">
                  <div className="space-y-4">
                    <Field key={ek('headline')} label="Headline" required error={bad('headline')}><input className="input" value={b.copy.headline} onChange={(e) => setCopy('headline', e.target.value)} /></Field>
                    <Field label="Sub headline"><input className="input" value={b.copy.subHeadline} onChange={(e) => setCopy('subHeadline', e.target.value)} /></Field>
                    <Field label="Body text"><textarea className="input" rows={3} value={b.copy.body} onChange={(e) => setCopy('body', e.target.value)} /></Field>
                    <Field label="S&K promo"><textarea className="input" rows={2} value={b.copy.terms} onChange={(e) => setCopy('terms', e.target.value)} /></Field>
                  </div>
                  <div>
                    <span className="label">Pratinjau teks (font brand)</span>
                    <motion.div layout className="rounded-2xl border-2 border-ink shadow-pop bg-brand text-white p-5 min-h-[220px] flex flex-col justify-center relative overflow-hidden">
                      <div className="checker absolute top-0 inset-x-0 h-2.5 border-b-2 border-ink" />
                      <div className="font-display font-black uppercase text-3xl leading-[0.95] break-words">{b.copy.headline || 'Headline di sini'}</div>
                      {b.copy.subHeadline && <div className="font-display font-bold text-lg text-brand-sun mt-2">{b.copy.subHeadline}</div>}
                      {b.copy.body && <p className="text-sm font-medium mt-2 whitespace-pre-line">{b.copy.body}</p>}
                      {b.copy.terms && <p className="text-[11px] opacity-90 mt-3">*{b.copy.terms}</p>}
                    </motion.div>
                    <p className="text-xs text-muted mt-2">Hanya pratinjau teks, bukan hasil desain.</p>
                  </div>
                  <div className="lg:col-span-2 space-y-4">
                    <Field key={ek('copyFinal')} label="" group error={bad('copyFinal')}>
                      <label className={`flex items-start gap-3 p-3 rounded-xl border-2 border-ink cursor-pointer ${b.copyFinal ? 'bg-brand-sun/50' : 'bg-card'}`}>
                        <input type="checkbox" className="w-6 h-6 mt-0.5 accent-[#D7191F]" checked={b.copyFinal} onChange={(e) => set('copyFinal', e.target.checked)} />
                        <span className="font-bold">Copywriting sudah final dan disetujui<span className="block text-sm font-medium text-muted">Teks yang berubah setelah diajukan dihitung sebagai revisi.</span></span>
                      </label>
                    </Field>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field key={ek('copyApprovedBy')} label="Manager yang menyetujui teks" required error={bad('copyApprovedBy')}><input className="input" value={b.copyApprovedBy} onChange={(e) => set('copyApprovedBy', e.target.value)} /></Field>
                      <Field label="Copywriter (bila ada)"><input className="input" value={b.copywriter} onChange={(e) => set('copywriter', e.target.value)} /></Field>
                    </div>
                    <Field key={ek('asset')} label="Tautan aset resolusi tinggi (foto, logo, elemen)" required error={bad('asset')} hint="Tautan Google Drive. Format: PSD, AI, JPG, PNG, RAW.">
                      <input className="input" placeholder="https://drive.google.com/…" value={b.assetLink} disabled={b.useBrandAssets} onChange={(e) => set('assetLink', e.target.value)} />
                    </Field>
                    <label className="flex items-center gap-3 font-bold cursor-pointer"><input type="checkbox" className="w-5 h-5 accent-[#D7191F]" checked={b.useBrandAssets} onChange={(e) => set('useBrandAssets', e.target.checked)} /> Tidak ada aset, gunakan aset brand</label>
                  </div>
                </div>
              )}

              {step === 3 && (
                <>
                  <Field key={ek('outputs')} label="Pilih ukuran (boleh lebih dari satu)" group required error={bad('outputs')}>
                    <div className="flex gap-2.5 flex-wrap">
                      {settings.sizePresets.map((p) => {
                        const k = 34 / Math.max(p.w, p.h)
                        return (
                          <motion.button type="button" key={p.name} whileHover={{ y: -3 }} whileTap={{ scale: 0.94 }} onClick={() => addOutput(p)} className="card !shadow-pop-sm p-2.5 flex flex-col items-center w-[104px]">
                            <span className="h-10 flex items-center"><span className="border-2 border-ink bg-brand-sun rounded-sm" style={{ width: Math.max(8, p.w * k), height: Math.max(8, p.h * k) }} /></span>
                            <span className="font-bold text-xs mt-1">{p.name}</span>
                            <span className="text-[10px] text-muted font-semibold">{p.size} {p.unit}</span>
                          </motion.button>
                        )
                      })}
                      <motion.button type="button" whileHover={{ y: -3 }} whileTap={{ scale: 0.94 }} onClick={() => addOutput(null)} className="card !shadow-pop-sm p-2.5 flex flex-col items-center justify-center w-[104px] border-dashed">
                        <Plus size={22} /><span className="font-bold text-xs mt-1">Custom</span>
                      </motion.button>
                    </div>
                  </Field>
                  <div className="space-y-2.5">
                    <AnimatePresence>
                      {b.outputs.map((o, i) => (
                        <motion.div key={i} layout initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="rounded-xl border-2 border-ink p-2.5 grid grid-cols-2 sm:grid-cols-[1.2fr_1fr_80px_90px_44px] gap-2 items-center bg-paper">
                          <input className="input" placeholder="Nama (mis. Feed)" value={o.name} onChange={(e) => editOutput(i, 'name', e.target.value)} aria-label="Nama output" />
                          <input className="input" placeholder="Ukuran" value={o.size} onChange={(e) => editOutput(i, 'size', e.target.value)} aria-label="Ukuran" />
                          <select className="input" value={o.unit} onChange={(e) => editOutput(i, 'unit', e.target.value)} aria-label="Satuan">{['px', 'mm', 'cm', 'm'].map((u) => <option key={u}>{u}</option>)}</select>
                          <select className="input" value={o.fileFormat} onChange={(e) => editOutput(i, 'fileFormat', e.target.value)} aria-label="Format file">{FORMATS.map((u) => <option key={u}>{u}</option>)}</select>
                          <button type="button" className="btn-ghost" onClick={() => set('outputs', b.outputs.filter((_, j) => j !== i))} aria-label="Hapus output"><Trash2 size={18} /></button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {b.outputs.length === 0 && <p className="text-sm font-semibold text-muted">Belum ada ukuran. Ketuk salah satu kotak di atas.</p>}
                  </div>
                  <Field label="Catatan tambahan"><textarea className="input" rows={3} value={b.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
                </>
              )}

              {step === 4 && (
                <>
                  <div className="rounded-2xl border-2 border-ink bg-brand-orange text-brand-char p-5 relative overflow-hidden">
                    <div className="sticker bg-card text-ink">{b.type || 'Jenis belum dipilih'}</div>
                    <div className="title-xl text-3xl md:text-5xl mt-2 break-words">{b.title || 'Tanpa judul'}</div>
                    <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm font-semibold">
                      <div>Dibutuhkan: <b>{b.neededDate ? fmtDate(b.neededDate, { long: true }) : '-'}</b> {urgent && <span className="chip bg-brand text-white ml-1">Urgent</span>}</div>
                      <div>Media: <b>{b.media || '-'}</b> · Brand: <b>{b.brand}</b></div>
                      <div>Tujuan: {b.purpose || '-'}</div>
                      <div>Audiens: {b.audience || '-'}</div>
                      <div className="sm:col-span-2">Objektif: {b.objective || '-'}</div>
                      <div className="sm:col-span-2">Headline: <b>{b.copy.headline || '-'}</b></div>
                      <div>Referensi: {b.references.length} · Aset: {b.useBrandAssets ? 'aset brand' : b.assetLink ? 'tautan terlampir' : '-'}</div>
                      <div>Output: {b.outputs.map((o) => `${o.name} ${o.size}${o.unit}`).join(', ') || '-'}</div>
                    </div>
                    <div className="checker absolute bottom-0 inset-x-0 h-2.5 border-t-2 border-ink" />
                  </div>
                  {done < total && <p className="font-semibold text-brand">Brief Meter belum 100%. Lengkapi dulu supaya tidak dikembalikan.</p>}
                  <ErrorBox error={error} />
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t-2 border-ink/15">
            <Btn onClick={() => (step === 0 ? nav(-1) : go(step - 1))}><ArrowLeft size={18} /> {step === 0 ? 'Batal' : 'Kembali'}</Btn>
            {step < 4 ? <Btn kind="primary" onClick={() => go(step + 1)}>Lanjut <ArrowRight size={18} /></Btn> : (
              <Btn kind="primary" className="!min-h-[54px] !px-6 font-display text-lg" disabled={busy} onClick={submit}><Rocket size={20} /> {busy ? 'Meluncur…' : 'Luncurkan Brief'}</Btn>
            )}
          </div>
        </div>

        <div className="hidden md:block"><BriefMeter done={done} total={total} mood={mood} /></div>
      </div>
    </div>
  )
}
