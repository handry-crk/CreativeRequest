import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { toast } from 'sonner'
import { Award, BarChart3, Copy, Download, ExternalLink, LogOut, MessageCircle, Palette, Pencil, Plus, Settings, Trash2 } from 'lucide-react'
import { api, copyText, fileUrl, fmtDate, fmtDateTime, safeHref, useApp, useLoad, waReply } from '../lib.jsx'
import { Avatar, Btn, DivisionChip, Empty, ErrorBox, Field, Mascot, Modal, PageTitle, Skeleton, spring } from '../ui.jsx'
import { RequestCard } from './Queue.jsx'
import { COLORS, EMOJIS } from './Login.jsx'

// ============================================================ Request Saya
const NEXT = {
  Draft: { label: 'Lanjutkan brief', to: (r) => `/ajukan/${r.id}`, who: 'owner' },
  'Perlu Dilengkapi': { label: 'Lengkapi brief', to: (r) => `/ajukan/${r.id}`, who: 'owner' },
  'Review Requester': { label: 'Review hasil', who: 'owner' },
  Antre: { label: 'Mulai kerjakan', who: 'maker' },
  Dikerjakan: { label: 'Kirim hasil', who: 'maker' },
  Revisi: { label: 'Kerjakan revisi', who: 'maker' },
  Disetujui: { label: 'Serahkan file', who: 'maker' },
}

export function MyRequests() {
  const { user } = useApp()
  const nav = useNavigate()
  const { data, reload } = useLoad(() => api('/requests?mine=true'))
  const delDraft = async (r) => {
    try { await api(`/requests/${r.id}`, { method: 'DELETE' }); toast('Draft dihapus.'); reload() } catch (e) { toast.error(e.message) }
  }
  if (!data) return <><PageTitle tone="bg-brand-cream">Request Saya</PageTitle><Skeleton rows={3} /></>
  const action = (r) => {
    const n = NEXT[r.status]
    if (!n) return null
    const mine = n.who === 'owner' ? r.requesterId === user.id : r.designerId === user.id
    return mine ? n : null
  }
  const todo = data.filter(action)
  const rest = data.filter((r) => !action(r))
  return (
    <div>
      <PageTitle tone="bg-brand-cream" sub={todo.length ? `${todo.length} hal menunggu kamu.` : 'Tidak ada yang menunggu kamu saat ini.'}>Request Saya</PageTitle>
      {data.length === 0 ? (
        <Empty title="Belum ada request. Yuk racik brief pertama!"><Link to="/ajukan" className="btn-primary"><Plus size={18} /> Ajukan request</Link></Empty>
      ) : (
        <>
          {todo.length > 0 && (
            <>
              <h2 className="font-display font-extrabold text-xl mb-2">Perlu tindakan</h2>
              <motion.div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-6" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
                {todo.map((r) => {
                  const n = action(r)
                  return (
                    <motion.div key={r.id} variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }} className="relative">
                      <RequestCard c={{ ...r, code: r.code || 'DRAFT', title: r.title || 'Tanpa judul' }} onClick={() => nav(n.to ? n.to(r) : `/r/${r.id}`)} />
                      <motion.span initial={{ scale: 0, rotate: 12 }} animate={{ scale: 1, rotate: 4 }} transition={{ ...spring, delay: 0.2 }} className="sticker bg-brand-sun text-brand-char absolute -top-2 -right-1 pointer-events-none">{n.label}</motion.span>
                      {r.status === 'Draft' && <button onClick={() => delDraft(r)} className="absolute bottom-2 right-12 w-10 h-10 rounded-lg border-2 border-ink bg-card flex items-center justify-center" aria-label={`Hapus draft ${r.title || ''}`}><Trash2 size={16} /></button>}
                    </motion.div>
                  )
                })}
              </motion.div>
            </>
          )}
          {rest.length > 0 && (
            <>
              <h2 className="font-display font-extrabold text-xl mb-2">Semua request</h2>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {rest.map((r) => (
                  <div key={r.id} className="relative">
                    <RequestCard c={r} onClick={() => nav(`/r/${r.id}`)} />
                    <span className="chip bg-card absolute -top-2 right-2">{r.status}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================ Galeri
function TiltCard({ children, className = '', onClick }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [6, -6]), { stiffness: 300, damping: 25 })
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-6, 6]), { stiffness: 300, damping: 25 })
  const move = (e) => {
    if (!window.matchMedia('(hover: hover)').matches) return
    const b = e.currentTarget.getBoundingClientRect()
    x.set((e.clientX - b.left) / b.width - 0.5); y.set((e.clientY - b.top) / b.height - 0.5)
  }
  return (
    <motion.div onMouseMove={move} onMouseLeave={() => { x.set(0); y.set(0) }} onClick={onClick} style={{ rotateX: rx, rotateY: ry, transformPerspective: 700 }} className={className}>
      {children}
    </motion.div>
  )
}

const REACTS = ['👏', '🔥', '😍', '💡']

export function Gallery() {
  const { user, isLead, settings } = useApp()
  const { data, setData } = useLoad(() => api('/gallery'))
  const [f, setF] = useState({ division: '', type: '' })
  const [open, setOpen] = useState(null)
  const list = useMemo(() => (data || []).filter((g) => (!f.division || g.division === f.division) && (!f.type || g.type === f.type)), [data, f])

  const react = async (g, emoji) => {
    if (!user) return toast('Masuk dulu untuk memberi reaksi.')
    try {
      const res = await api(`/requests/${g.id}/react`, { method: 'POST', body: { emoji } })
      setData((d) => d.map((x) => (x.id === g.id ? { ...x, reactions: res.reactions } : x)))
    } catch (e) { toast.error(e.message) }
  }
  const pick = async (g) => {
    try {
      const res = await api(`/gallery/${g.id}/pick`, { method: 'POST' })
      setData((d) => d.map((x) => ({ ...x, isPick: x.id === g.id ? res.isPick : res.isPick ? false : x.isPick })))
      toast.success(res.isPick ? 'Dijadikan Karya Pilihan Minggu Ini.' : 'Karya Pilihan dicabut.')
    } catch (e) { toast.error(e.message) }
  }
  const Reactions = ({ g }) => (
    <div className="flex gap-1.5 flex-wrap">
      {REACTS.map((e) => {
        const n = (g.reactions?.[e] || []).length
        const mine = user && (g.reactions?.[e] || []).includes(user.id)
        return (
          <motion.button key={e} whileTap={{ scale: 1.4, rotate: -12 }} onClick={(ev) => { ev.stopPropagation(); react(g, e) }}
            className={`min-h-[36px] px-2 rounded-full border-2 border-ink text-sm font-bold ${mine ? 'bg-brand-sun text-brand-char' : 'bg-card'}`} aria-label={`Reaksi ${e}`}>
            {e} <AnimatePresence mode="popLayout"><motion.span key={n} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="inline-block tabular-nums">{n || ''}</motion.span></AnimatePresence>
          </motion.button>
        )
      })}
    </div>
  )

  return (
    <div>
      <PageTitle tone="bg-brand text-white" sub="Hasil karya tim Creative untuk semua divisi.">Galeri Karya</PageTitle>
      {!data ? <Skeleton rows={3} h="h-40" /> : data.length === 0 ? (
        <Empty title="Galeri masih kosong. Karya pertama segera hadir!">{user && <Link to="/ajukan" className="btn-primary">Ajukan request</Link>}</Empty>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap mb-4">
            <select className="input !w-auto" value={f.division} onChange={(e) => setF((s) => ({ ...s, division: e.target.value }))} aria-label="Filter divisi">
              <option value="">Semua divisi</option>{settings.divisions.map((d) => <option key={d.name} value={d.name}>{d.emoji} {d.name}</option>)}
            </select>
            <select className="input !w-auto max-w-[240px]" value={f.type} onChange={(e) => setF((s) => ({ ...s, type: e.target.value }))} aria-label="Filter jenis">
              <option value="">Semua jenis</option>{settings.types.map((t) => <option key={t.name}>{t.name}</option>)}
            </select>
          </div>
          <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 [&>*]:mb-4">
            {list.map((g, i) => (
              <motion.div key={g.id} className="break-inside-avoid" initial={{ opacity: 0, y: 24, rotate: i % 2 ? 2 : -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ ...spring, delay: Math.min(i, 12) * 0.04 }}>
                <TiltCard className="card overflow-hidden cursor-pointer relative" onClick={() => setOpen(g)}>
                  {g.isPick && <span className="sticker bg-brand-sun text-brand-char absolute top-2 left-2 z-10 -rotate-3"><Award size={14} /> Karya Pilihan Minggu Ini</span>}
                  {g.thumbnailUrl ? <img src={fileUrl(g.thumbnailUrl)} alt={g.title} loading="lazy" className="w-full block border-b-2 border-ink" /> : (
                    <div className="h-40 bg-brand-orange border-b-2 border-ink flex items-center justify-center"><Mascot mood="bangga" size={80} /></div>
                  )}
                  <div className="p-3">
                    <div className="font-display font-extrabold leading-tight">{g.title}</div>
                    <div className="flex items-center gap-2 flex-wrap mt-1.5 text-xs font-bold text-muted">
                      <DivisionChip name={g.division} /><span>oleh {g.designerName || '-'}</span><span>· {fmtDate(g.finishedAt)}</span>
                      {g.revisionRound === 0 && <span className="chip bg-[#C9F0D6] text-brand-char">Sekali Jadi</span>}
                    </div>
                    <div className="mt-2"><Reactions g={g} /></div>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </div>
          {list.length === 0 && <p className="text-center font-semibold text-muted py-8">Tidak ada karya untuk filter ini.</p>}
        </>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title || ''} wide>
        {open && (() => {
          const g = data.find((x) => x.id === open.id) || open
          return (
            <div>
              <div className="relative rounded-xl border-2 border-ink overflow-hidden bg-ink/5">
                {g.thumbnailUrl ? <img src={fileUrl(g.thumbnailUrl)} alt={g.title} className="w-full block" /> : <div className="h-52 flex items-center justify-center"><Mascot mood="bangga" /></div>}
                <motion.div className="absolute inset-0 checker" initial={{ x: 0 }} animate={{ x: '101%' }} transition={{ duration: 0.7, ease: 'easeInOut' }} />
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-3 text-sm font-bold">
                <span>{g.code}</span><DivisionChip name={g.division} /><span>{g.type}</span><span>· desainer {g.designerName || '-'}</span><span>· pengaju {g.requesterName}</span>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap mt-3">
                <Reactions g={g} />
                {isLead && <Btn kind={g.isPick ? 'default' : 'sun'} onClick={() => pick(g)}><Award size={18} /> {g.isPick ? 'Cabut Karya Pilihan' : 'Jadikan Karya Pilihan'}</Btn>}
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

// ============================================================ Brand Kit
const CATS = ['Brand Guideline', 'Logo', 'Font', 'Warna', 'Template', 'Aset Eksternal (B2B)', 'Aturan']

export function BrandKit() {
  const { isLead } = useApp()
  const { data, reload } = useLoad(() => api('/brand-kit'))
  const [sample, setSample] = useState('Cimol Bojot AA, kriuk di luar lembut di dalam')
  const [edit, setEdit] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)
  if (!data) return <><PageTitle tone="bg-brand-sun">Brand Kit</PageTitle><Skeleton rows={3} /></>

  const colors = data.filter((x) => x.category === 'Warna')
  const fonts = data.filter((x) => x.category === 'Font' && x.meta?.family)
  const rules = data.filter((x) => x.category === 'Aturan')
  const links = data.filter((x) => !['Warna', 'Aturan'].includes(x.category) && !x.meta?.family)

  const copyHex = async (c) => {
    if (await copyText(c.meta.hex)) { setCopied(c.id); setTimeout(() => setCopied(null), 1100) }
  }
  const save = async () => {
    setError(null)
    try {
      const body = { category: edit.category, title: edit.title, description: edit.description, link: edit.link, meta: edit.category === 'Warna' ? { hex: edit.hex } : edit.meta || {} }
      if (edit.id) await api(`/brand-kit/${edit.id}`, { method: 'PUT', body })
      else await api('/brand-kit', { method: 'POST', body })
      setEdit(null); reload(); toast.success('Brand Kit diperbarui.')
    } catch (e) { setError(e) }
  }
  const del = async () => { await api(`/brand-kit/${edit.id}`, { method: 'DELETE' }); setEdit(null); reload() }
  const EditBtn = ({ it }) => isLead && (
    <button onClick={(e) => { e.stopPropagation(); setEdit({ ...it, hex: it.meta?.hex || '' }) }} className="absolute top-1.5 right-1.5 w-9 h-9 rounded-lg bg-card text-ink border-2 border-ink flex items-center justify-center" aria-label={`Ubah ${it.title}`}><Pencil size={15} /></button>
  )

  return (
    <div>
      <PageTitle tone="bg-brand-sun" sub="Satu sumber untuk warna, font, logo, dan aturan brand. Dipakai semua divisi."
        right={isLead && <Btn onClick={() => setEdit({ category: 'Brand Guideline', title: '', description: '', link: '', hex: '#D7191F' })}><Plus size={18} /> Tambah item</Btn>}>Brand Kit</PageTitle>

      <h2 className="font-display font-extrabold text-2xl mb-3">Warna <span className="text-sm font-sans font-semibold text-muted">ketuk untuk salin kode</span></h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {colors.map((c, i) => (
          <motion.button key={c.id} onClick={() => copyHex(c)} whileHover={{ y: -4, rotate: i % 2 ? 1.5 : -1.5 }} whileTap={{ scale: 0.94 }}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.04 }} className="card overflow-hidden text-left relative">
            <div className="h-24 border-b-2 border-ink relative" style={{ background: c.meta.hex }}>
              <AnimatePresence>{copied === c.id && <motion.span initial={{ scale: 0, rotate: -12 }} animate={{ scale: 1, rotate: -4 }} exit={{ scale: 0 }} className="sticker bg-card text-ink absolute inset-0 m-auto w-fit h-fit">Tersalin!</motion.span>}</AnimatePresence>
            </div>
            <div className="p-2.5"><div className="font-bold text-sm">{c.title}</div><div className="text-xs font-bold text-muted flex items-center gap-1"><Copy size={11} />{c.meta.hex}</div></div>
            <EditBtn it={c} />
          </motion.button>
        ))}
      </div>

      <h2 className="font-display font-extrabold text-2xl mb-3">Font resmi</h2>
      <div className="card p-4 mb-8">
        <Field label="Coba ketik teksmu"><input className="input" value={sample} onChange={(e) => setSample(e.target.value)} /></Field>
        <div className="grid md:grid-cols-3 gap-3 mt-4">
          {fonts.map((f) => (
            <div key={f.id} className="rounded-xl border-2 border-ink p-3 bg-paper relative">
              <div className="text-xs font-bold text-muted">{f.title} · {f.meta.family} {f.meta.weight}</div>
              <motion.div layout className="mt-1 break-words leading-tight" style={{ fontFamily: `"${f.meta.family}", sans-serif`, fontWeight: f.meta.weight, fontSize: f.meta.weight >= 900 ? 30 : f.meta.weight >= 700 ? 22 : 16, textTransform: f.meta.weight >= 900 ? 'uppercase' : 'none' }}>{sample || 'Ketik sesuatu'}</motion.div>
              <p className="text-xs text-muted mt-2">{f.description}</p>
            </div>
          ))}
        </div>
      </div>

      <h2 className="font-display font-extrabold text-2xl mb-3">Folder & dokumen</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {links.map((it) => (
          <motion.div key={it.id} whileHover={{ y: -4 }} className="card p-4 relative">
            <span className="chip bg-brand-cream text-brand-char">{it.category}</span>
            <div className="font-display font-extrabold text-lg mt-2 pr-8">{it.title}</div>
            <p className="text-sm text-muted font-medium mt-1">{it.description}</p>
            {safeHref(it.link) ? <a href={safeHref(it.link)} target="_blank" rel="noreferrer" className="btn-primary mt-3"><ExternalLink size={18} /> Buka</a> : <span className="chip bg-ink/10 mt-3">Tautan belum diisi</span>}
            <EditBtn it={it} />
          </motion.div>
        ))}
      </div>

      <h2 className="font-display font-extrabold text-2xl mb-3">Aturan</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {rules.map((it) => (
          <div key={it.id} className="card p-4 relative !bg-brand-cream text-brand-char">
            <div className="font-display font-extrabold text-lg pr-8">{it.title}</div>
            <p className="text-sm font-medium mt-1 whitespace-pre-line">{it.description}</p>
            {safeHref(it.link) && <a href={safeHref(it.link)} target="_blank" rel="noreferrer" className="btn mt-3 text-ink"><ExternalLink size={18} /> Lihat contoh</a>}
            <EditBtn it={it} />
          </div>
        ))}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Ubah item Brand Kit' : 'Tambah item Brand Kit'}>
        {edit && (
          <div className="space-y-3">
            <Field label="Kategori"><select className="input" value={edit.category} onChange={(e) => setEdit((s) => ({ ...s, category: e.target.value }))}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Judul" required><input className="input" value={edit.title} onChange={(e) => setEdit((s) => ({ ...s, title: e.target.value }))} /></Field>
            <Field label="Keterangan"><textarea className="input" rows={3} value={edit.description || ''} onChange={(e) => setEdit((s) => ({ ...s, description: e.target.value }))} /></Field>
            {edit.category === 'Warna'
              ? <Field label="Kode warna (hex)"><div className="flex gap-2"><input type="color" className="w-12 h-[46px] rounded-xl border-2 border-ink" value={edit.hex || '#D7191F'} onChange={(e) => setEdit((s) => ({ ...s, hex: e.target.value.toUpperCase() }))} /><input className="input" value={edit.hex || ''} onChange={(e) => setEdit((s) => ({ ...s, hex: e.target.value }))} /></div></Field>
              : <Field label="Tautan (Drive / dokumen)"><input className="input" placeholder="https://…" value={edit.link || ''} onChange={(e) => setEdit((s) => ({ ...s, link: e.target.value }))} /></Field>}
            <ErrorBox error={error} />
            <div className="flex gap-2">
              {edit.id && <Btn onClick={del} aria-label="Hapus item"><Trash2 size={18} /></Btn>}
              <Btn kind="primary" className="flex-1" onClick={save}>Simpan</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ============================================================ Pengaturan
const ROLES = ['Requester', 'Manager Divisi', 'Designer', 'Creative Lead', 'Admin']

export function SettingsPage() {
  const { user, settings, reloadSettings } = useApp()
  const [tab, setTab] = useState('Pengguna')
  const { data: users, reload } = useLoad(() => api('/users'))
  const [types, setTypes] = useState(settings.types)
  const [holiday, setHoliday] = useState('')
  const [pinFor, setPinFor] = useState(null)
  const [newPin, setNewPin] = useState('')

  const upd = async (u, body) => {
    try { await api(`/users/${u.id}`, { method: 'PUT', body }); reload(); toast.success(`${u.name} diperbarui.`) } catch (e) { toast.error(e.message) }
  }
  const saveSettings = async (body, msg) => {
    try { await api('/settings', { method: 'PUT', body }); await reloadSettings(); toast.success(msg) } catch (e) { toast.error(e.message) }
  }
  const seed = async () => {
    try { const r = await api('/seed-demo', { method: 'POST' }); reload(); toast.success(`Data contoh terisi: ${r.requests} request, ${r.users} pengguna (PIN ${r.pin}).`) } catch (e) { toast.error(e.message) }
  }
  const exportCsv = async () => {
    try { const blob = await api('/export/requests.csv'); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'creative-requests.csv'; a.click() } catch (e) { toast.error(e.message) }
  }

  return (
    <div>
      <PageTitle tone="bg-brand-cream">Pengaturan</PageTitle>
      <div className="flex gap-2 flex-wrap mb-4">
        {['Pengguna', 'Jenis & SLA', 'Hari libur', 'Data'].map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`relative min-h-[44px] px-4 rounded-xl border-2 border-ink font-bold ${tab === k ? 'text-white' : 'bg-card'}`}>
            {tab === k && <motion.span layoutId="stab" className="absolute inset-0 bg-brand rounded-[10px]" />}<span className="relative">{k}</span>
          </button>
        ))}
      </div>

      {tab === 'Pengguna' && (!users ? <Skeleton /> : (
        <div className="space-y-2.5">
          {users.some((u) => !u.approved) && (
            <div className="card !bg-brand-sun/40 p-3 space-y-2">
              <h2 className="font-display font-extrabold text-lg">Menunggu persetujuan ({users.filter((u) => !u.approved).length})</h2>
              {users.filter((u) => !u.approved).map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 flex-wrap bg-card border-2 border-ink rounded-xl p-2.5">
                  <div className="flex items-center gap-2 min-w-0"><Avatar user={u} /><div className="min-w-0"><div className="font-bold truncate">{u.name}</div><div className="text-xs text-muted truncate">{u.division}{u.jobTitle ? ` · ${u.jobTitle}` : ''}{u.email ? ` · ${u.email}` : ''} · daftar {fmtDateTime(u.createdAt)}</div></div></div>
                  <div className="flex gap-2">
                    <Btn kind="primary" onClick={() => upd(u, { approved: true })}>Setujui</Btn>
                    <Btn onClick={async () => { try { await api(`/users/${u.id}`, { method: 'DELETE' }); reload(); toast(`Pendaftaran ${u.name} ditolak.`) } catch (e) { toast.error(e.message) } }}>Tolak</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-sm font-semibold text-muted">Pendaftaran baru aktif setelah disetujui Admin, lalu masuk sebagai Requester. Atur role Creative Lead, Designer, dan Manager Divisi di sini.</p>
          {users.filter((u) => u.approved).map((u) => {
            const locked = u.role === 'Admin' && user.role !== 'Admin'
            return (
            <div key={u.id} className={`card !shadow-pop-sm p-3 grid grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_110px_90px_auto] gap-2 items-center ${u.active ? '' : 'opacity-50'}`}>
              <div className="col-span-2 md:col-span-1 flex items-center gap-2 min-w-0"><Avatar user={u} /><div className="min-w-0"><div className="font-bold truncate">{u.name}</div><div className="text-xs text-muted truncate">{u.jobTitle || '-'}{u.email ? ` · ${u.email}` : ''}</div></div></div>
              <select className="input" value={u.division} onChange={(e) => upd(u, { division: e.target.value })} aria-label="Divisi" disabled={locked}>{settings.divisions.map((d) => <option key={d.name}>{d.name}</option>)}</select>
              <select className="input" value={u.role} onChange={(e) => upd(u, { role: e.target.value })} aria-label="Role" disabled={u.id === user.id || locked}>{ROLES.map((r) => <option key={r} disabled={r === 'Admin' && user.role !== 'Admin'}>{r}</option>)}</select>
              <select className="input" value={u.specialty} onChange={(e) => upd(u, { specialty: e.target.value })} aria-label="Spesialis" disabled={locked}>{['Semua', 'Digital', 'Cetak', 'Video'].map((r) => <option key={r}>{r}</option>)}</select>
              <input className="input" type="number" min="1" defaultValue={u.capacity} onBlur={(e) => Number(e.target.value) !== u.capacity && upd(u, { capacity: Number(e.target.value) })} aria-label="Kapasitas" title="Kapasitas request aktif" disabled={locked} />
              <div className="flex gap-1.5 col-span-2 md:col-span-1">
                {!locked && <Btn onClick={() => { setPinFor(u); setNewPin('') }}>Reset PIN</Btn>}
                {u.id !== user.id && !locked && <Btn kind="ghost" onClick={() => upd(u, { active: !u.active })}>{u.active ? 'Nonaktifkan' : 'Aktifkan'}</Btn>}
              </div>
            </div>
          )})}
        </div>
      ))}

      {tab === 'Jenis & SLA' && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-muted mb-3">“Min. hari” = jarak minimal hari kerja antara pengajuan dan tanggal dibutuhkan. Di bawah itu, request berstatus Urgent. “Draft” = draft pertama setelah brief diterima.</p>
          <div className="space-y-2">
            {types.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_84px_84px] gap-2 items-center">
                <input className="input" value={t.name} onChange={(e) => setTypes((s) => s.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Nama jenis" />
                <input className="input" type="number" min="0" placeholder="Min. hari" value={t.minLeadDays ?? ''} onChange={(e) => setTypes((s) => s.map((x, j) => (j === i ? { ...x, minLeadDays: e.target.value } : x)))} aria-label="Minimal hari kerja" />
                <input className="input" type="number" min="0" placeholder="Draft" value={t.draftDays ?? ''} onChange={(e) => setTypes((s) => s.map((x, j) => (j === i ? { ...x, draftDays: e.target.value } : x)))} aria-label="Hari draft" />
              </div>
            ))}
          </div>
          <Btn kind="primary" className="mt-4" onClick={() => saveSettings({ types }, 'Jenis dan SLA tersimpan.')}>Simpan SLA</Btn>
        </div>
      )}

      {tab === 'Hari libur' && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-muted mb-3">Hari kerja: Senin–Sabtu. Tanggal di bawah tidak dihitung sebagai hari kerja.</p>
          <div className="flex gap-2"><input type="date" className="input !w-auto" value={holiday} onChange={(e) => setHoliday(e.target.value)} aria-label="Tanggal libur" />
            <Btn kind="primary" disabled={!holiday} onClick={() => { saveSettings({ holidays: [...new Set([...settings.holidays, holiday])].sort() }, 'Hari libur ditambahkan.'); setHoliday('') }}><Plus size={18} /> Tambah</Btn></div>
          <div className="flex gap-2 flex-wrap mt-3">
            {settings.holidays.length === 0 && <span className="text-sm text-muted font-semibold">Belum ada hari libur.</span>}
            {settings.holidays.map((h) => <button key={h} onClick={() => saveSettings({ holidays: settings.holidays.filter((x) => x !== h) }, 'Hari libur dihapus.')} className="chip bg-card !py-1.5">{fmtDate(h, { long: true })} ✕</button>)}
          </div>
        </div>
      )}

      {tab === 'Data' && (
        <div className="card p-4 space-y-3">
          <div><Btn onClick={exportCsv}><Download size={18} /> Unduh semua request (CSV)</Btn></div>
          {user.role === 'Admin' && (
            <div>
              <Btn kind="sun" onClick={seed}>Isi data contoh</Btn>
              <p className="text-sm text-muted font-semibold mt-1">Hanya bisa saat belum ada request. Membuat 8 pengguna contoh (PIN 123456) dan 10 request di berbagai status.</p>
            </div>
          )}
        </div>
      )}

      <Modal open={!!pinFor} onClose={() => setPinFor(null)} title={`Reset PIN ${pinFor?.name || ''}`}>
        <Field label="PIN baru (6 angka)"><input className="input text-center tracking-[0.5em] font-extrabold text-xl" inputMode="numeric" maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} /></Field>
        <Btn kind="primary" className="w-full mt-3" disabled={newPin.length !== 6} onClick={async () => { await upd(pinFor, { newPin }); setPinFor(null) }}>Simpan PIN</Btn>
      </Modal>
    </div>
  )
}

// ============================================================ Profil
function Switch({ on, onChange, label, hint }) {
  return (
    <button onClick={() => onChange(!on)} className="w-full flex items-center justify-between gap-3 py-3 border-b border-ink/10 last:border-0 text-left" role="switch" aria-checked={on}>
      <span><span className="font-bold block">{label}</span>{hint && <span className="text-sm text-muted">{hint}</span>}</span>
      <span className={`w-14 h-8 rounded-full border-2 border-ink p-0.5 flex shrink-0 ${on ? 'bg-brand justify-end' : 'bg-ink/10 justify-start'}`}><motion.span layout transition={spring} className="w-6 h-6 rounded-full bg-card border-2 border-ink" /></span>
    </button>
  )
}

export function Profile() {
  const { user, setUser, signOut, isLead, isCreative, settings } = useApp()
  const nav = useNavigate()
  const prefs = user.prefs || {}
  const save = async (body) => {
    try { setUser(await api('/me/prefs', { method: 'PUT', body })) } catch (e) { toast.error(e.message) }
  }
  const av = user.avatar || {}
  return (
    <div className="max-w-2xl">
      <div className="card p-5 flex items-center gap-4 mb-4 !bg-brand-orange text-brand-char">
        <motion.div whileHover={{ rotate: [0, -8, 8, 0] }}><Avatar user={user} size={72} /></motion.div>
        <div className="min-w-0">
          <h1 className="title-xl text-3xl break-words">{user.name}</h1>
          <div className="font-bold text-sm mt-1">{user.role} · {user.division}{user.jobTitle ? ` · ${user.jobTitle}` : ''}</div>
        </div>
      </div>

      <div className="card p-4 mb-4">
        <h2 className="font-display font-extrabold text-lg mb-2">Avatar</h2>
        <div className="flex gap-1.5 flex-wrap">{EMOJIS.map((e) => <button key={e} onClick={() => save({ avatar: { ...av, emoji: e } })} className={`w-10 h-10 rounded-lg border-2 text-lg ${av.emoji === e ? 'border-ink bg-brand-sun' : 'border-transparent'}`}>{e}</button>)}</div>
        <div className="flex gap-2 flex-wrap mt-2">{COLORS.map((c) => <button key={c} onClick={() => save({ avatar: { ...av, color: c } })} aria-label={`Warna ${c}`} className={`w-8 h-8 rounded-full border-2 border-ink ${av.color === c ? 'ring-4 ring-brand-sun' : ''}`} style={{ background: c }} />)}</div>
      </div>

      <div className="card p-4 mb-4">
        <h2 className="font-display font-extrabold text-lg">Preferensi</h2>
        <Switch on={!!prefs.reduceMotion} onChange={(v) => save({ reduceMotion: v })} label="Kurangi animasi" hint="Tanpa confetti dan gerakan berulang." />
        <Switch on={!!prefs.sound} onChange={(v) => save({ sound: v })} label="Suara" hint="Bunyi singkat saat brief dikirim dan request selesai." />
        <Switch on={!!prefs.darkMode} onChange={(v) => save({ darkMode: v })} label="Mode Lembur" hint="Tampilan gelap." />
      </div>

      <div className="grid sm:grid-cols-2 gap-2 mb-4 md:hidden">
        <Link to="/dashboard" className="btn"><BarChart3 size={18} /> Dashboard</Link>
        <Link to="/brand-kit" className="btn"><Palette size={18} /> Brand Kit</Link>
        {isLead && <Link to="/pengaturan" className="btn"><Settings size={18} /> Pengaturan</Link>}
      </div>

      <div className="flex gap-2 flex-wrap">
        {isCreative && <Btn onClick={async () => (await copyText(waReply(settings))) && toast.success('Balasan WA tersalin.')}><MessageCircle size={18} /> Salin balasan WA</Btn>}
        <Btn onClick={() => { signOut(); nav('/masuk') }}><LogOut size={18} /> Keluar</Btn>
      </div>
    </div>
  )
}
