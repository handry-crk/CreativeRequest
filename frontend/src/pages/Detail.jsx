import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, Check, Copy, CopyPlus, ExternalLink, Flame, Link2, PartyPopper, Pencil, Play, Send, ThumbsUp, Undo2, Upload, XCircle } from 'lucide-react'
import { api, blip, celebrate, copyText, fileUrl, safeHref, fmtDate, fmtDateTime, uploadImage, useApp, useLoad } from '../lib.jsx'
import { Avatar, Btn, DeadlineRing, DivisionChip, Empty, ErrorBox, Field, Lives, Mascot, Modal, Skeleton, StatusChip, UrgentFlame, spring } from '../ui.jsx'

const STATIONS = ['Diajukan', 'Antre', 'Dikerjakan', 'Review Internal', 'Review Requester', 'Disetujui', 'Selesai']
const STATION_OF = { 'Menunggu Persetujuan Urgent': 0, Diajukan: 0, 'Perlu Dilengkapi': 0, Antre: 1, Dikerjakan: 2, Revisi: 2, 'Review Internal': 3, 'Review Requester': 4, Disetujui: 5, Selesai: 6 }
const isImg = (u) => /^\/api\/files\//.test(u || '') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u || '')

function JourneyTrack({ status }) {
  const at = STATION_OF[status]
  if (at === undefined) return null
  return (
    <div className="card p-4 overflow-x-auto no-scrollbar">
      <div className="flex items-start min-w-[640px]">
        {STATIONS.map((s, i) => (
          <div key={s} className="flex-1 flex flex-col items-center relative">
            {i > 0 && (
              <div className="absolute top-[17px] right-1/2 w-full h-0 border-t-[3px] border-dotted border-ink/30">
                <motion.div className="absolute -top-[3px] left-0 h-0 border-t-[3px] border-brand" initial={{ width: 0 }} animate={{ width: i <= at ? '100%' : '0%' }} transition={{ duration: 0.4, delay: i * 0.08 }} />
              </div>
            )}
            <motion.div
              className={`relative z-10 w-9 h-9 rounded-full border-2 border-ink flex items-center justify-center font-extrabold text-sm ${i < at ? 'bg-brand-sun text-brand-char' : i === at ? 'bg-brand text-white' : 'bg-card text-muted'}`}
              animate={i === at ? { y: [0, -6, 0] } : { y: 0 }} transition={i === at ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : spring}
            >
              {i < at ? <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring, delay: i * 0.08 }}><Check size={18} strokeWidth={3.5} /></motion.span> : i + 1}
            </motion.div>
            <div className={`mt-1.5 text-[11px] font-bold text-center leading-tight px-1 ${i === at ? '' : 'text-muted'}`}>{i === at && status !== s ? status : s}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BeforeAfter({ before, after }) {
  const [pos, setPos] = useState(50)
  return (
    <div className="max-w-xl">
      <div className="relative rounded-xl border-2 border-ink overflow-hidden select-none bg-ink/5">
        <img src={fileUrl(after)} alt="Versi terbaru" className="block w-full" />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
          <img src={fileUrl(before)} alt="Versi sebelumnya" className="block h-full max-w-none object-cover" style={{ width: `${10000 / pos}%` }} />
        </div>
        <div className="absolute top-0 bottom-0 w-1 bg-brand-sun border-x border-ink" style={{ left: `calc(${pos}% - 2px)` }} />
        <span className="absolute top-2 left-2 chip bg-card">Sebelum</span>
        <span className="absolute top-2 right-2 chip bg-brand-sun text-brand-char">Sesudah</span>
      </div>
      <input type="range" min="2" max="98" value={pos} onChange={(e) => setPos(Number(e.target.value))} className="w-full mt-2 accent-[#D7191F]" aria-label="Geser untuk membandingkan sebelum dan sesudah" />
    </div>
  )
}

function Section({ title, children, right }) {
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-display font-extrabold text-lg">{title}</h2>{right}
      </div>
      {children}
    </section>
  )
}

const Row = ({ k, children }) => (
  <div className="grid grid-cols-[120px_1fr] gap-2 py-1.5 border-b border-ink/10 last:border-0 text-sm">
    <div className="font-bold text-muted">{k}</div><div className="font-medium break-words min-w-0">{children || '-'}</div>
  </div>
)

function ImagePicker({ value, onChange, label = 'Unggah gambar', maxKB = 300 }) {
  const [busy, setBusy] = useState(false)
  const pick = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    try { onChange(await uploadImage(f, maxKB)) } catch (err) { toast.error(err.message) }
    setBusy(false)
  }
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="btn cursor-pointer"><Upload size={18} /> {busy ? 'Mengunggah…' : label}<input type="file" accept="image/*" className="hidden" onChange={pick} /></label>
      {value && isImg(value) && <img src={fileUrl(value)} alt="Pratinjau" className="h-16 rounded-lg border-2 border-ink" />}
    </div>
  )
}

export default function Detail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user, isLead, isCreative, settings } = useApp()
  const { data: r, error: loadErr, setData, reload } = useLoad(() => api(`/requests/${id}`), [id])
  const { data: users } = useLoad(() => (isLead ? api('/users') : Promise.resolve([])), [isLead])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [reveal, setReveal] = useState(false)
  const [confirmAssign, setConfirmAssign] = useState(null)
  const [cancelOpen, setCancelOpen] = useState(false)

  // form state
  const [bc, setBc] = useState({ ok: {}, note: '', priority: 'Normal', designerId: '' })
  const [preview, setPreview] = useState('')
  const [ir, setIr] = useState({ items: {}, note: '' })
  const [rev, setRev] = useState({ text: '', link: '', open: false })
  const [fin, setFin] = useState(null)
  const celebrated = useRef(false)

  useEffect(() => {
    if (!r) return
    if (r.status === 'Disetujui' && !fin) setFin({ driveFolderLink: '', thumbnailUrl: '', showInGallery: true, outputs: r.outputs.map((o, i) => ({ fileLink: o.fileLink || '', fileName: o.fileName || r.suggestedNames[i] })) })
    if (r.isUrgent && bc.priority === 'Normal' && r.status === 'Diajukan') setBc((s) => ({ ...s, priority: 'Urgent' }))
    if (r.status === 'Selesai' && !celebrated.current && user && (user.id === r.requesterId || user.id === r.designerId)) {
      celebrated.current = true
      const key = `cr_seen_done_${r.id}_${user.id}`
      if (!localStorage.getItem(key)) { localStorage.setItem(key, '1'); setReveal(true); celebrate('big'); blip(user.prefs?.sound, 'ding') }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.status, r?.id])

  if (loadErr) return <Empty mood="bingung" title={loadErr.message}><Link to="/" className="btn">Kembali ke Antrean</Link></Empty>
  if (!r) return <Skeleton rows={5} />

  const act = async (path, body, after) => {
    setBusy(true); setError(null)
    try {
      const next = await api(`/requests/${id}/${path}`, { method: 'POST', body: body || {} })
      setData(next)
      after?.(next)
      return next
    } catch (e) {
      if (e.needsConfirm) setConfirmAssign(e.message)
      else { setError(e); if (e.livesLeft === 0) toast.error(e.message) }
    } finally { setBusy(false) }
  }

  const owner = user.id === r.requesterId || user.role === 'Admin' || (user.role === 'Manager Divisi' && user.division === r.division)
  const maker = isLead || user.id === r.designerId
  const designers = (users || []).filter((u) => ['Designer', 'Creative Lead'].includes(u.role) && u.active)
  const previews = r.previewUrls || []
  const last = previews[previews.length - 1]
  const prevImg = previews.filter((p) => isImg(p.url))
  const max = settings.maxRevisions || 2
  const livesLeft = max - (r.revisionRound || 0)
  const ap = r.urgentApproval || {}
  const briefItems = settings.briefCheckItems
  const missingItems = briefItems.filter((i) => bc.ok[i] === false)
  const checkedItems = briefItems.filter((i) => bc.ok[i] === true)

  return (
    <div className="max-w-5xl space-y-4">
      <button onClick={() => nav(-1)} className="btn-ghost !px-1"><ArrowLeft size={18} /> Kembali</button>

      {/* header poster */}
      <div className="relative rounded-3xl border-2 border-ink shadow-pop bg-brand-orange text-brand-char p-5 md:p-7 overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-black text-sm tracking-widest">{r.code || 'DRAFT'}</span>
              <StatusChip status={r.status} />
              {r.isUrgent && <UrgentFlame />}
              {r.priority && r.priority !== 'Urgent' && <span className="chip bg-card text-ink">Prioritas {r.priority}</span>}
            </div>
            <h1 className="title-xl text-3xl md:text-5xl mt-2 break-words">{r.title || 'Tanpa judul'}</h1>
            <div className="mt-3 flex items-center gap-2 flex-wrap text-sm font-bold">
              <DivisionChip name={r.division} />
              <span>oleh {r.requesterName}</span>
              <span>· butuh {fmtDate(r.neededDate, { long: true })}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <DeadlineRing daysLeft={r.daysLeft} overdue={r.overdue} atRisk={r.atRisk} size={56} />
            <div className="bg-card text-ink border-2 border-ink rounded-lg px-2 py-1"><Lives round={r.revisionRound || 0} max={max} withLabel /></div>
          </div>
        </div>
        {r.designerName && <div className="mt-3 inline-flex items-center gap-2 bg-card text-ink border-2 border-ink rounded-full pl-1 pr-3 py-1 text-sm font-bold"><Avatar name={r.designerName} size={24} /> Desainer: {r.designerName}</div>}
        <div className="checker absolute bottom-0 inset-x-0 h-2.5 border-t-2 border-ink" />
      </div>

      <JourneyTrack status={r.status} />

      {/* ---------------------------------------------------- panel aksi */}
      <AnimatePresence mode="wait">
        <motion.div key={r.status} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
          {r.overdue && isCreative && <div className="card !border-brand p-3 font-bold text-brand">Lewat deadline. Kabari pengaju, lalu perbarui status.</div>}

          {r.status === 'Menunggu Persetujuan Urgent' && (
            <Section title="Persetujuan request urgent">
              <p className="text-sm font-semibold flex items-start gap-2"><Flame size={18} className="text-brand shrink-0 flicker" fill="#D7191F" /> Alasan: {r.urgentReason}</p>
              <div className="grid sm:grid-cols-2 gap-2 mt-3 text-sm font-bold">
                <div className={`rounded-xl border-2 border-ink p-3 ${ap.managerAt ? 'bg-[#C9F0D6] text-brand-char' : ''}`}>Manager divisi: {ap.managerAt ? `disetujui ${ap.managerName}` : 'menunggu'}</div>
                <div className={`rounded-xl border-2 border-ink p-3 ${ap.leadAt ? 'bg-[#C9F0D6] text-brand-char' : ''}`}>Creative Lead: {ap.leadAt ? `disetujui ${ap.leadName}` : 'menunggu'}</div>
              </div>
              <div className="flex gap-2 flex-wrap mt-3">
                {user.role === 'Manager Divisi' && user.division === r.division && !ap.managerAt && <Btn kind="primary" disabled={busy} onClick={() => act('approve-urgent')}>Setujui sebagai Manager</Btn>}
                {user.role === 'Creative Lead' && !ap.leadAt && <Btn kind="primary" disabled={busy} onClick={() => act('approve-urgent')}>Setujui sebagai Creative Lead</Btn>}
                {user.role === 'Admin' && !ap.managerAt && <Btn disabled={busy} onClick={() => act('approve-urgent', { as: 'manager' })}>Setujui (sebagai Manager)</Btn>}
                {user.role === 'Admin' && !ap.leadAt && <Btn disabled={busy} onClick={() => act('approve-urgent', { as: 'lead' })}>Setujui (sebagai Creative Lead)</Btn>}
              </div>
            </Section>
          )}

          {r.status === 'Diajukan' && isLead && (
            <Section title="Cek brief">
              <p className="text-sm text-muted font-semibold mb-3">Tandai semua poin. Brief hanya bisa diterima bila keenamnya lengkap; poin yang kurang dikirim ke pengaju. ({checkedItems.length}/{briefItems.length})</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {briefItems.map((it) => (
                  <div key={it} className="flex items-center justify-between gap-2 rounded-xl border-2 border-ink p-2 pl-3">
                    <span className="font-bold text-sm">{it}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setBc((s) => ({ ...s, ok: { ...s.ok, [it]: true } }))} className={`w-10 h-10 rounded-lg border-2 border-ink flex items-center justify-center ${bc.ok[it] === true ? 'bg-brand-green text-white' : 'bg-card'}`} aria-label={`${it}: lengkap`}><Check size={18} strokeWidth={3} /></button>
                      <button onClick={() => setBc((s) => ({ ...s, ok: { ...s.ok, [it]: false } }))} className={`w-10 h-10 rounded-lg border-2 border-ink flex items-center justify-center ${bc.ok[it] === false ? 'bg-brand text-white' : 'bg-card'}`} aria-label={`${it}: kurang`}><XCircle size={18} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <Field label="Catatan untuk pengaju"><textarea className="input mt-3" rows={2} value={bc.note} onChange={(e) => setBc((s) => ({ ...s, note: e.target.value }))} /></Field>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <Field label="Prioritas" group>
                  <div className="flex gap-2">{['Normal', 'Tinggi', 'Urgent'].map((p) => <button key={p} onClick={() => setBc((s) => ({ ...s, priority: p }))} className={`flex-1 min-h-[44px] rounded-xl border-2 border-ink font-bold text-sm ${bc.priority === p ? 'bg-brand text-white' : 'bg-card'}`}>{p}</button>)}</div>
                </Field>
                <Field label={`Desainer${r.media === 'Cetak' ? ' (request cetak)' : ''}`} group>
                  <div className="space-y-1.5">
                    {designers.length === 0 && <p className="text-sm font-semibold text-brand">Belum ada desainer. Atur role di Pengaturan → Pengguna.</p>}
                    {designers.map((d) => {
                      const fit = d.specialty === 'Semua' || d.specialty === r.media
                      const frac = Math.min(1, (d.activeCount || 0) / d.capacity)
                      return (
                        <button key={d.id} onClick={() => setBc((s) => ({ ...s, designerId: d.id }))} className={`w-full text-left rounded-xl border-2 border-ink p-2 ${bc.designerId === d.id ? 'bg-brand-sun/60' : 'bg-card'}`}>
                          <div className="flex items-center justify-between gap-2 text-sm font-bold">
                            <span className="flex items-center gap-2"><Avatar user={d} size={24} />{d.name} <span className="chip bg-ink/5">{d.specialty}</span>{fit && <span className="chip bg-[#C9F0D6] text-brand-char">cocok</span>}</span>
                            <span>{d.activeCount || 0}/{d.capacity}</span>
                          </div>
                          <div className="h-2 rounded-full bg-ink/10 mt-1.5 overflow-hidden"><motion.div className="h-full rounded-full" style={{ background: frac >= 1 ? '#D7191F' : frac >= 0.7 ? '#C98A1B' : '#2E7D4F' }} initial={{ width: 0 }} animate={{ width: `${frac * 100}%` }} /></div>
                        </button>
                      )
                    })}
                  </div>
                </Field>
              </div>
              <div className="mt-3"><ErrorBox error={error} /></div>
              <div className="flex gap-2 flex-wrap mt-3">
                <Btn kind="primary" disabled={busy || checkedItems.length < briefItems.length} onClick={() => act('check-brief', { decision: 'terima', checked: checkedItems, priority: bc.priority, designerId: bc.designerId, note: bc.note }, () => { toast.success('Brief diterima dan masuk antrean.') })}><Check size={18} /> Terima brief</Btn>
                <Btn disabled={busy} onClick={() => act('check-brief', { decision: 'kembalikan', missing: missingItems, note: bc.note }, () => toast('Brief dikembalikan ke pengaju.'))}><Undo2 size={18} /> Kembalikan ({missingItems.length})</Btn>
                <Btn kind="ghost" disabled={busy} onClick={() => act('check-brief', { decision: 'tolak', note: bc.note })}>Tolak</Btn>
              </div>
            </Section>
          )}

          {r.status === 'Diajukan' && !isLead && <div className="card p-4 flex items-center gap-3"><Mascot mood="semangat" size={56} /><p className="font-bold">Brief sedang dicek Creative Lead. Kamu akan dikabari bila ada yang perlu ditambah.</p></div>}

          {r.status === 'Perlu Dilengkapi' && (
            <div className="card !bg-brand-tint text-brand-char p-4">
              <p className="font-display font-extrabold text-lg">Brief-nya belum lengkap nih. Ada {r.briefCheck?.missing?.length || 0} hal yang perlu ditambah.</p>
              <ul className="list-disc pl-5 font-semibold text-sm mt-1">{(r.briefCheck?.missing || []).map((m) => <li key={m}>{m}</li>)}</ul>
              {r.briefCheck?.note && <p className="text-sm mt-2">Catatan {r.briefCheck.by}: “{r.briefCheck.note}”</p>}
              {owner && <Link to={`/ajukan/${r.id}`} className="btn-primary mt-3"><Pencil size={18} /> Lengkapi brief</Link>}
            </div>
          )}

          {r.status === 'Antre' && maker && (
            <Section title="Siap dikerjakan?">
              <p className="text-sm font-semibold text-muted">Draft pertama paling lambat {fmtDate(r.deadlineDraft, { long: true })}.</p>
              <Btn kind="primary" className="mt-3" disabled={busy} onClick={() => act('start', null, () => toast.success('Mulai dikerjakan. Semangat!'))}><Play size={18} /> Mulai kerjakan</Btn>
            </Section>
          )}

          {['Dikerjakan', 'Revisi'].includes(r.status) && maker && (
            <Section title={r.status === 'Revisi' ? `Kirim hasil revisi (ronde ${r.revisionRound})` : 'Kirim hasil ke review internal'}>
              <ImagePicker value={preview} onChange={setPreview} label="Unggah pratinjau hasil" maxKB={600} />
              <Field label="atau tautan pratinjau" ><input className="input mt-2" placeholder="https://drive.google.com/…" value={isImg(preview) && preview.startsWith('/api') ? '' : preview} onChange={(e) => setPreview(e.target.value)} /></Field>
              <div className="mt-3"><ErrorBox error={error} /></div>
              <Btn kind="primary" className="mt-3" disabled={busy} onClick={() => act('to-internal-review', { previewUrl: preview }, () => { setPreview(''); toast.success('Hasil dikirim ke review internal.') })}><Send size={18} /> Kirim ke review internal</Btn>
            </Section>
          )}

          {r.status === 'Review Internal' && isCreative && (
            <Section title="Review internal">
              {user.id === r.designerId ? <p className="font-semibold text-sm">Menunggu review dari Creative Lead atau desainer lain.</p> : (
                <>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {settings.internalReviewItems.map((it) => (
                      <label key={it} className={`flex items-center gap-3 rounded-xl border-2 border-ink p-3 cursor-pointer font-bold text-sm ${ir.items[it] ? 'bg-[#C9F0D6] text-brand-char' : 'bg-card'}`}>
                        <input type="checkbox" className="w-5 h-5 accent-[#2E7D4F]" checked={!!ir.items[it]} onChange={(e) => setIr((s) => ({ ...s, items: { ...s.items, [it]: e.target.checked } }))} />{it}
                      </label>
                    ))}
                  </div>
                  <Field label="Catatan untuk desainer (bila dikembalikan)"><textarea className="input mt-3" rows={2} value={ir.note} onChange={(e) => setIr((s) => ({ ...s, note: e.target.value }))} /></Field>
                  <div className="mt-3"><ErrorBox error={error} /></div>
                  <div className="flex gap-2 flex-wrap mt-3">
                    <Btn kind="primary" disabled={busy} onClick={() => act('internal-review', { items: ir.items }, () => toast.success('Lolos review internal. Dikirim ke pengaju.'))}><Check size={18} /> Lolos, kirim ke pengaju</Btn>
                    <Btn disabled={busy} onClick={() => act('internal-review', { decision: 'kembali', note: ir.note })}><Undo2 size={18} /> Kembalikan ke desainer</Btn>
                  </div>
                </>
              )}
            </Section>
          )}

          {r.status === 'Review Requester' && (
            <Section title={owner ? 'Hasil siap direview' : 'Menunggu review pengaju'}>
              {owner ? (
                <>
                  <p className="text-sm font-semibold text-muted">Cek hasilnya di bawah. Sisa nyawa revisi: {livesLeft}.</p>
                  <div className="flex gap-2 flex-wrap mt-3">
                    <Btn kind="primary" className="!min-h-[52px] font-display text-lg" disabled={busy} onClick={() => act('approve', null, (n) => { if (n.celebrate === 'sekali-jadi') { celebrate('gold'); toast.success('Sekali Jadi! Disetujui tanpa revisi.') } else { celebrate('small'); toast.success('Hasil disetujui. Tinggal serah terima file.') } blip(user.prefs?.sound) })}><ThumbsUp size={20} /> Setujui</Btn>
                    <Btn disabled={busy || livesLeft <= 0} onClick={() => setRev((s) => ({ ...s, open: true }))}><Pencil size={18} /> Minta revisi</Btn>
                  </div>
                  {livesLeft <= 0 && <p className="mt-2 text-sm font-bold text-brand">Nyawa revisi habis — ajukan request baru ya.</p>}
                  <div className="mt-3"><ErrorBox error={error} /></div>
                </>
              ) : <p className="font-semibold text-sm">Pengaju sedang mengecek hasil.</p>}
            </Section>
          )}

          {r.status === 'Disetujui' && maker && fin && (
            <Section title="Serah terima file">
              <div className="space-y-3">
                <Field label="Tautan folder Drive" required><input className="input" placeholder="https://drive.google.com/…" value={fin.driveFolderLink} onChange={(e) => setFin((s) => ({ ...s, driveFolderLink: e.target.value }))} /></Field>
                <Field label="Thumbnail untuk Galeri" required group><ImagePicker value={fin.thumbnailUrl} onChange={(v) => setFin((s) => ({ ...s, thumbnailUrl: v }))} label="Unggah thumbnail" /></Field>
                {r.outputs.map((o, i) => (
                  <div key={i} className="rounded-xl border-2 border-ink p-3 bg-paper">
                    <div className="font-bold text-sm mb-2">{o.name} · {o.size} {o.unit} · {o.fileFormat}</div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input className="input" placeholder="Tautan file" value={fin.outputs[i].fileLink} onChange={(e) => setFin((s) => ({ ...s, outputs: s.outputs.map((x, j) => (j === i ? { ...x, fileLink: e.target.value } : x)) }))} aria-label={`Tautan file ${o.name}`} />
                      <div className="flex gap-2">
                        <input className="input" placeholder="Nama file" value={fin.outputs[i].fileName} onChange={(e) => setFin((s) => ({ ...s, outputs: s.outputs.map((x, j) => (j === i ? { ...x, fileName: e.target.value } : x)) }))} aria-label={`Nama file ${o.name}`} />
                        <Btn onClick={async () => (await copyText(fin.outputs[i].fileName)) && toast.success('Nama file tersalin.')} aria-label="Salin nama file"><Copy size={16} /></Btn>
                      </div>
                    </div>
                    <p className="text-xs text-muted mt-1">Pola: {settings.namingPattern} → {r.suggestedNames[i]}</p>
                  </div>
                ))}
                <label className="flex items-center gap-3 font-bold cursor-pointer"><input type="checkbox" className="w-5 h-5 accent-[#D7191F]" checked={fin.showInGallery} onChange={(e) => setFin((s) => ({ ...s, showInGallery: e.target.checked }))} /> Tampilkan di Galeri Karya</label>
                <ErrorBox error={error} />
                <Btn kind="primary" className="!min-h-[52px] font-display text-lg" disabled={busy} onClick={() => act('finish', fin, (n) => { celebrate('big'); blip(user.prefs?.sound, 'ding'); toast.success('Selesai! File sudah diserahkan.'); (n.warnings || []).forEach((w) => toast.warning(w)) })}><PartyPopper size={20} /> Serahkan & selesai</Btn>
              </div>
            </Section>
          )}

          {r.status === 'Disetujui' && !maker && <div className="card p-4 flex items-center gap-3"><Mascot mood="bangga" size={56} /><p className="font-bold">Hasil disetujui. Desainer sedang menyiapkan file final.</p></div>}

          {['Ditolak', 'Batal'].includes(r.status) && <div className="card p-4 font-bold">{r.status === 'Ditolak' ? `Request ditolak. Alasan: ${r.rejectReason || '-'}` : 'Request dibatalkan.'}</div>}
        </motion.div>
      </AnimatePresence>

      {/* ---------------------------------------------------- hasil */}
      {(last || r.status === 'Selesai') && (
        <Section title={r.status === 'Selesai' ? 'Hasil akhir' : `Hasil terbaru${last ? ` (versi ${previews.length})` : ''}`}>
          {r.status === 'Selesai' && r.thumbnailUrl && (
            <div className="relative rounded-xl border-2 border-ink overflow-hidden mb-3 max-w-xl">
              <img src={fileUrl(r.thumbnailUrl)} alt={`Hasil akhir ${r.title}`} className="block w-full" />
              <AnimatePresence>{reveal && <motion.div className="absolute inset-0 checker" initial={{ x: 0 }} animate={{ x: '100%' }} transition={{ duration: 0.9, ease: 'easeInOut', delay: 0.3 }} onAnimationComplete={() => setReveal(false)} />}</AnimatePresence>
            </div>
          )}
          {r.status !== 'Selesai' && last && (prevImg.length >= 2 && isImg(last.url)
            ? <BeforeAfter before={prevImg[prevImg.length - 2].url} after={last.url} />
            : isImg(last.url)
              ? <img src={fileUrl(last.url)} alt="Pratinjau hasil" className="rounded-xl border-2 border-ink max-w-full md:max-w-xl" />
              : <a href={safeHref(last.url)} target="_blank" rel="noreferrer" className="btn"><ExternalLink size={18} /> Buka pratinjau hasil</a>)}
          {r.status === 'Selesai' && (
            <div className="space-y-2">
              {r.driveFolderLink && <a href={safeHref(r.driveFolderLink)} target="_blank" rel="noreferrer" className="btn-sun"><ExternalLink size={18} /> Buka folder Drive</a>}
              {r.outputs.map((o, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-xl border-2 border-ink p-2.5 text-sm">
                  <div className="min-w-0"><div className="font-bold">{o.name} · {o.size} {o.unit}</div><div className="text-muted truncate">{o.fileName}</div></div>
                  {o.fileLink && <a href={safeHref(o.fileLink)} target="_blank" rel="noreferrer" className="btn !min-h-[40px]"><Link2 size={16} /> File</a>}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {(r.revisionNotes || []).length > 0 && (
        <Section title="Catatan revisi">
          <div className="space-y-2">
            {r.revisionNotes.map((n) => (
              <div key={n.id} className="rounded-xl border-2 border-ink p-3 bg-paper">
                <div className="flex items-center justify-between text-xs font-bold text-muted"><span>Ronde {n.round} · {n.authorName}</span><span>{fmtDateTime(n.at)}</span></div>
                <p className="font-medium mt-1 whitespace-pre-line">{n.text}</p>
                {n.link && <a href={safeHref(n.link)} target="_blank" rel="noreferrer" className="text-sm font-bold underline">Lampiran</a>}
                {n.resolved && <span className="chip bg-[#C9F0D6] text-brand-char mt-1">sudah dikerjakan</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ---------------------------------------------------- brief */}
      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Tujuan & audiens">
          <Row k="Jenis">{r.type}</Row>
          <Row k="Media">{r.media} · {r.brand}</Row>
          <Row k="Outlet">{r.outlet}</Row>
          <Row k="Tujuan">{r.purpose}</Row>
          <Row k="Objektif">{r.objective}</Row>
          <Row k="Audiens">{r.audience}</Row>
          <Row k="Referensi">
            <div className="flex gap-2 flex-wrap">
              {(r.references || []).map((x, i) => isImg(x)
                ? <a key={x} href={fileUrl(x)} target="_blank" rel="noreferrer"><img src={fileUrl(x)} alt={`Referensi ${i + 1}`} className="h-16 rounded-lg border-2 border-ink" /></a>
                : <a key={x} href={safeHref(x)} target="_blank" rel="noreferrer" className="underline font-bold break-all">{x}</a>)}
            </div>
          </Row>
          <Row k="Catatan">{r.notes}</Row>
        </Section>
        <Section title="Teks & bahan">
          <Row k="Headline"><b>{r.copy?.headline}</b></Row>
          <Row k="Sub headline">{r.copy?.subHeadline}</Row>
          <Row k="Body"><span className="whitespace-pre-line">{r.copy?.body}</span></Row>
          <Row k="S&K">{r.copy?.terms}</Row>
          <Row k="Disetujui">{r.copyApprovedBy}{r.copywriter ? ` · Copywriter: ${r.copywriter}` : ''}</Row>
          <Row k="Aset">{r.useBrandAssets ? 'Gunakan aset brand' : r.assetLink && <a href={safeHref(r.assetLink)} target="_blank" rel="noreferrer" className="underline font-bold break-all">{r.assetLink}</a>}</Row>
          <Row k="Output">{(r.outputs || []).map((o) => `${o.name} ${o.size} ${o.unit} (${o.fileFormat})`).join(' · ')}</Row>
        </Section>
      </div>

      <Section title="Riwayat">
        <ol className="space-y-2">
          {[...(r.log || [])].reverse().map((l, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-brand border-2 border-ink mt-1.5 shrink-0" />
              <div><span className="font-bold">{l.action}</span> <span className="text-muted">· {l.byName} · {fmtDateTime(l.at)}</span>{l.note && <div className="text-muted">“{l.note}”</div>}</div>
            </li>
          ))}
        </ol>
      </Section>

      <div className="flex gap-2 flex-wrap">
        <Link to={`/ajukan?dari=${r.id}`} className="btn"><CopyPlus size={18} /> Duplikat jadi request baru</Link>
        {!['Selesai', 'Disetujui', 'Batal', 'Ditolak'].includes(r.status) && (owner || isLead) && <Btn kind="ghost" onClick={() => setCancelOpen(true)}>Batalkan request</Btn>}
      </div>

      {/* ---------------------------------------------------- modal */}
      <Modal open={rev.open} onClose={() => setRev((s) => ({ ...s, open: false }))} title="Minta revisi">
        <div className="flex items-center justify-between mb-3"><Lives round={r.revisionRound || 0} max={max} withLabel /><span className="text-sm font-bold">{livesLeft === 1 ? 'Ini nyawa terakhir.' : `Sisa ${livesLeft}.`}</span></div>
        <Field label="Apa yang perlu diubah?" required hint="Tulis selengkap mungkin dalam satu kali kirim."><textarea className="input" rows={4} value={rev.text} onChange={(e) => setRev((s) => ({ ...s, text: e.target.value }))} autoFocus /></Field>
        <Field label="Tautan coretan / contoh (opsional)"><input className="input mt-2" value={rev.link} onChange={(e) => setRev((s) => ({ ...s, link: e.target.value }))} /></Field>
        <div className="mt-3"><ErrorBox error={error} /></div>
        <Btn kind="primary" className="w-full mt-3" disabled={busy} onClick={async () => { const n = await act('request-revision', { text: rev.text, link: rev.link }); if (n) { setRev({ text: '', link: '', open: false }); toast('Revisi dikirim ke desainer.') } }}>Kirim revisi</Btn>
      </Modal>

      <Modal open={!!confirmAssign} onClose={() => setConfirmAssign(null)} title="Desainer sudah penuh">
        <p className="font-semibold">{confirmAssign}</p>
        <div className="flex gap-2 mt-4">
          <Btn className="flex-1" onClick={() => setConfirmAssign(null)}>Pilih yang lain</Btn>
          <Btn kind="primary" className="flex-1" onClick={() => { setConfirmAssign(null); act('check-brief', { decision: 'terima', checked: checkedItems, priority: bc.priority, designerId: bc.designerId, note: bc.note, confirm: true }, () => toast.success('Brief diterima dan masuk antrean.')) }}>Tetap tugaskan</Btn>
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Batalkan request ini?">
        <p className="font-semibold">Request yang dibatalkan tidak bisa dilanjutkan lagi.</p>
        <div className="flex gap-2 mt-4">
          <Btn className="flex-1" onClick={() => setCancelOpen(false)}>Tidak jadi</Btn>
          <Btn kind="primary" className="flex-1" onClick={async () => { setCancelOpen(false); await act('cancel'); reload() }}>Ya, batalkan</Btn>
        </div>
      </Modal>
    </div>
  )
}
