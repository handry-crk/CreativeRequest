import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { toast } from 'sonner'
import { api, fmtDate, usePolling, useApp } from '../lib.jsx'
import { Avatar, DeadlineRing, DivisionChip, Empty, Lives, PageTitle, Skeleton, StatusChip, Tile, UrgentFlame, spring } from '../ui.jsx'

export function RequestCard({ c, onClick, highlight, dragging, shake }) {
  return (
    <motion.div
      layout="position" layoutId={dragging ? undefined : `card-${c.id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={shake ? { x: [0, -10, 10, -6, 6, 0], opacity: 1, y: 0 } : { opacity: 1, y: 0, x: 0 }}
      transition={spring}
      whileHover={{ y: -3, rotate: -0.6 }} onClick={onClick}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-label={onClick ? `${c.code} ${c.title}, ${c.status}` : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={`card p-3 cursor-pointer text-left w-full focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-sun ${c.overdue ? 'breathe !border-brand' : ''} ${highlight ? '!bg-brand-sun/40' : ''} ${dragging ? 'shadow-pop-lg rotate-3' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-extrabold text-muted tracking-wide">{c.code}</div>
          <div className="font-bold leading-snug line-clamp-2">{c.title}</div>
        </div>
        <DeadlineRing daysLeft={c.daysLeft} overdue={c.overdue} atRisk={c.atRisk} />
      </div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <DivisionChip name={c.division} />
        {c.isUrgent && <UrgentFlame />}
        <span className="chip bg-ink/5 max-w-[140px] truncate">{c.type?.split(' / ')[0]}</span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted min-w-0">
          {c.designerName ? <><Avatar name={c.designerName} size={22} /><span className="truncate">{c.designerName}</span></> : <span>Belum ada desainer</span>}
        </div>
        <Lives round={c.revisionRound || 0} />
      </div>
    </motion.div>
  )
}

function DraggableCard({ c, canDrag, ...rest }) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: c.id, disabled: !canDrag })
  return (
    <div ref={setNodeRef} {...listeners} className={isDragging ? 'opacity-30' : ''} style={{ touchAction: canDrag ? 'none' : undefined }}>
      <RequestCard c={c} {...rest} />
    </div>
  )
}

function Column({ status, cards, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div ref={setNodeRef} className={`w-[270px] shrink-0 rounded-2xl border-2 border-dashed p-2 transition-colors ${isOver ? 'border-brand bg-brand-sun/30' : 'border-ink/25 bg-ink/[0.03]'}`}>
      <div className="flex items-center justify-between px-1 pb-2">
        <StatusChip status={status} />
        <span className="font-display font-black text-xl">{cards.length}</span>
      </div>
      <div className="space-y-2.5 min-h-[80px]">{children}</div>
    </div>
  )
}

export default function Queue() {
  const { user, isCreative, settings } = useApp()
  const nav = useNavigate()
  const [q, setQ] = useState(null)
  const [filter, setFilter] = useState({ division: '', mine: false, flag: '' })
  const [tab, setTab] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [shakeId, setShakeId] = useState(null)
  const [moved, setMoved] = useState({})
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const load = async () => {
    try {
      const next = await api('/queue')
      setQ((prev) => {
        if (prev) {
          const before = Object.fromEntries(prev.cards.map((c) => [c.id, c.status]))
          const changed = {}
          next.cards.forEach((c) => { if (before[c.id] && before[c.id] !== c.status) changed[c.id] = true })
          if (Object.keys(changed).length) { setMoved(changed); setTimeout(() => setMoved({}), 1800) }
        }
        return next
      })
    } catch { /* tetap tampilkan data terakhir */ }
  }
  usePolling(load, 8000)

  const cards = useMemo(() => (q?.cards || []).filter((c) =>
    (!filter.division || c.division === filter.division) &&
    (!filter.mine || c.requesterId === user?.id || c.designerId === user?.id) &&
    (!filter.flag || (filter.flag === 'overdue' ? c.overdue : c.atRisk)),
  ), [q, filter, user])

  const open = (c) => {
    if (!user) return toast('Masuk dulu untuk melihat detail request.', { action: { label: 'Masuk', onClick: () => nav('/masuk') } })
    if (isCreative || user.division === c.division || user.id === c.requesterId) nav(`/r/${c.id}`)
    else toast.info('Brief lengkap hanya untuk divisi pengaju dan tim Creative.')
  }

  const onDragEnd = async ({ active, over }) => {
    setDragId(null)
    if (!over) return
    const c = q.cards.find((x) => x.id === active.id)
    if (!c || c.status === over.id) return
    try {
      await api(`/requests/${c.id}/move`, { method: 'POST', body: { to: over.id } })
      setQ((s) => ({ ...s, cards: s.cards.map((x) => (x.id === c.id ? { ...x, status: over.id } : x)) }))
      toast.success(`${c.code} mulai dikerjakan. Semangat!`)
      load()
    } catch (e) {
      setShakeId(c.id); setTimeout(() => setShakeId(null), 500)
      toast.error(e.message, e.openDetail ? { action: { label: 'Buka detail', onClick: () => nav(`/r/${c.id}`) } } : undefined)
    }
  }

  if (!q) return <><PageTitle>Antrean</PageTitle><Skeleton rows={4} /></>

  const statuses = q.statuses.filter((s) => s !== 'Menunggu Persetujuan Urgent' || q.counts[s] > 0)
  const activeTab = tab && statuses.includes(tab) ? tab : statuses.find((s) => cards.some((c) => c.status === s)) || statuses[0]
  const dragCard = dragId && q.cards.find((c) => c.id === dragId)
  const line = q.active === 0 ? 'Antrean kosong. Saatnya rapikan Brand Kit!' : `${q.active} request jalan` + (q.atRisk ? `, ${q.atRisk} mendekati deadline` : '') + (q.overdue ? `, ${q.overdue} lewat deadline` : '') + '.'

  return (
    <div>
      <PageTitle sub={<>{fmtDate(q.today, { long: true })} · {line}</>}>Antrean</PageTitle>

      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-3 px-3 md:mx-0 md:px-0">
        <Tile label="Menunggu cek brief" value={q.counts['Diajukan'] || 0} />
        <Tile label="Antre" value={q.counts['Antre'] || 0} />
        <Tile label="Dikerjakan" value={(q.counts['Dikerjakan'] || 0) + (q.counts['Revisi'] || 0)} tone="!bg-brand-orange text-brand-char" />
        <Tile label="Sedang direview" value={(q.counts['Review Internal'] || 0) + (q.counts['Review Requester'] || 0)} />
        <Tile label="Mendekati deadline" value={q.atRisk} tone={q.atRisk ? '!bg-brand-sun text-brand-char' : ''} active={filter.flag === 'atRisk'} onClick={() => setFilter((f) => ({ ...f, flag: f.flag === 'atRisk' ? '' : 'atRisk' }))} />
        <Tile label="Lewat deadline" value={q.overdue} tone={q.overdue ? '!bg-brand text-white' : ''} active={filter.flag === 'overdue'} onClick={() => setFilter((f) => ({ ...f, flag: f.flag === 'overdue' ? '' : 'overdue' }))} />
      </div>

      <div className="flex items-center gap-2 flex-wrap my-4">
        <select className="input !w-auto !min-h-[44px]" value={filter.division} onChange={(e) => setFilter((f) => ({ ...f, division: e.target.value }))} aria-label="Filter divisi">
          <option value="">Semua divisi</option>
          {settings.divisions.map((d) => <option key={d.name} value={d.name}>{d.emoji} {d.name}</option>)}
        </select>
        {user && (
          <button onClick={() => setFilter((f) => ({ ...f, mine: !f.mine }))} className={`btn !shadow-none ${filter.mine ? '!bg-brand-sun text-brand-char' : ''}`}>Punya saya</button>
        )}
        {isCreative && <span className="hidden md:inline text-sm text-muted font-semibold">Geser kartu dari Antre ke Dikerjakan untuk mulai.</span>}
      </div>

      {q.cards.length === 0 ? (
        <Empty title="Antrean kosong. Saatnya rapikan Brand Kit!">
          {user ? <Link to="/ajukan" className="btn-primary">Ajukan request pertama</Link> : <Link to="/masuk" className="btn-primary">Masuk untuk mengajukan</Link>}
        </Empty>
      ) : (
        <>
          {/* papan desktop */}
          <div className="hidden md:block">
            <DndContext sensors={sensors} onDragStart={(e) => setDragId(e.active.id)} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
              <div className="flex gap-3 overflow-x-auto pb-4 items-start">
                {statuses.map((s) => {
                  const list = cards.filter((c) => c.status === s)
                  return (
                    <Column key={s} status={s} cards={list}>
                      {list.map((c) => (
                        <DraggableCard key={c.id} c={c} canDrag={isCreative} onClick={() => open(c)} highlight={moved[c.id]} shake={shakeId === c.id} />
                      ))}
                    </Column>
                  )
                })}
              </div>
              <DragOverlay dropAnimation={{ duration: 200 }}>{dragCard && <RequestCard c={dragCard} dragging />}</DragOverlay>
            </DndContext>
          </div>

          {/* tab status mobile */}
          <div className="md:hidden">
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 pb-3">
              {statuses.map((s) => {
                const n = cards.filter((c) => c.status === s).length
                return (
                  <button key={s} onClick={() => setTab(s)} className={`relative shrink-0 min-h-[44px] px-3 rounded-xl border-2 border-ink font-bold text-sm ${activeTab === s ? 'text-white' : 'bg-card'}`}>
                    {activeTab === s && <motion.span layoutId="qtab" className="absolute inset-0 bg-brand rounded-[10px]" />}
                    <span className="relative">{s} <span className="opacity-80">{n}</span></span>
                  </button>
                )
              })}
            </div>
            <AnimatePresence mode="popLayout">
              <motion.div key={activeTab} className="space-y-3" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
                {cards.filter((c) => c.status === activeTab).map((c) => (
                  <motion.div key={c.id} variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}>
                    <RequestCard c={c} onClick={() => open(c)} highlight={moved[c.id]} />
                  </motion.div>
                ))}
                {cards.filter((c) => c.status === activeTab).length === 0 && <p className="text-center text-muted font-semibold py-8">Tidak ada request di status ini.</p>}
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}
