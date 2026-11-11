import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { api, fmtDate, fmtNum, useApp, useLoad, ymd } from '../lib.jsx'
import { Avatar, Btn, Empty, PageTitle, Skeleton, Tile } from '../ui.jsx'

function periods() {
  const t = new Date()
  const monday = new Date(t); monday.setDate(t.getDate() - ((t.getDay() + 6) % 7))
  const m1 = new Date(t.getFullYear(), t.getMonth(), 1)
  const pm1 = new Date(t.getFullYear(), t.getMonth() - 1, 1)
  const pmEnd = new Date(t.getFullYear(), t.getMonth(), 0)
  const d90 = new Date(t); d90.setDate(t.getDate() - 89)
  return {
    'Minggu ini': [ymd(monday), ymd(t)],
    'Bulan ini': [ymd(m1), ymd(t)],
    'Bulan lalu': [ymd(pm1), ymd(pmEnd)],
    '90 hari': [ymd(d90), ymd(t)],
  }
}

function Panel({ title, insight, children }) {
  return (
    <motion.section className="card p-4 min-w-0" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}>
      <h2 className="font-display font-extrabold text-lg">{title}</h2>
      {insight && <p className="text-sm font-semibold text-muted mt-0.5 mb-2">{insight}</p>}
      {children}
    </motion.section>
  )
}

const pctTxt = (v) => (v === null || v === undefined ? '-' : `${fmtNum(v, 1)}%`)

export default function Dashboard() {
  const { isLead, settings } = useApp()
  const P = useMemo(periods, [])
  const [period, setPeriod] = useState('Bulan ini')
  const [division, setDivision] = useState('')
  const [from, to] = P[period]
  const { data: d } = useLoad(() => api(`/dashboard?frm=${from}&to=${to}${division ? `&division=${encodeURIComponent(division)}` : ''}`), [from, to, division])

  const exportCsv = async () => {
    try {
      const blob = await api('/export/requests.csv')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = 'creative-requests.csv'; a.click()
    } catch (e) { toast.error(e.message) }
  }

  const head = (
    <PageTitle tone="bg-brand-sun" sub={d ? `${fmtDate(d.from)} – ${fmtDate(d.to)}` : ''} right={isLead && <Btn onClick={exportCsv}><Download size={18} /> Unduh CSV</Btn>}>Dashboard</PageTitle>
  )
  const filters = (
    <div className="flex gap-2 flex-wrap mb-4">
      {Object.keys(P).map((k) => (
        <button key={k} onClick={() => setPeriod(k)} className={`relative min-h-[44px] px-3 rounded-xl border-2 border-ink font-bold text-sm ${period === k ? 'text-white' : 'bg-card'}`}>
          {period === k && <motion.span layoutId="ptab" className="absolute inset-0 bg-brand rounded-[10px]" />}<span className="relative">{k}</span>
        </button>
      ))}
      <select className="input !w-auto" value={division} onChange={(e) => setDivision(e.target.value)} aria-label="Filter divisi">
        <option value="">Semua divisi</option>{settings.divisions.map((x) => <option key={x.name} value={x.name}>{x.emoji} {x.name}</option>)}
      </select>
    </div>
  )
  if (!d) return <>{head}{filters}<Skeleton rows={4} /></>
  const t = d.totals
  if (t.total === 0) return <>{head}{filters}<Empty mood="bingung" title="Belum ada request di periode ini."><Link to="/ajukan" className="btn-primary">Ajukan request</Link></Empty></>

  const topUrgent = [...d.perDivision].filter((x) => x.urgentPct > 0).sort((a, b) => b.urgentPct - a.urgentPct)[0]
  const topReturned = [...d.perDivision].filter((x) => x.returnedPct > 0).sort((a, b) => b.returnedPct - a.returnedPct)[0]
  const full = d.perDesigner.filter((x) => x.active >= x.capacity)

  return (
    <div>
      {head}{filters}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
        <Tile label="Total request" value={t.total} tone="!bg-brand text-white" />
        <Tile label="Selesai" value={t.selesai} />
        <Tile label="Tepat waktu" value={t.onTimePct} digits={0} suffix="%" hint={t.onTimePct === null ? 'belum ada yang selesai' : 'dari yang selesai'} />
        <Tile label="Rata-rata hari kerja" value={t.avgDays} digits={1} hint="diterima → selesai" />
        <Tile label="Rata-rata ronde revisi" value={t.avgRevisi} digits={1} />
        <Tile label="Request urgent" value={t.urgentPct} suffix="%" tone={t.urgentPct > 20 ? '!bg-brand-tint text-brand-char' : ''} />
        <Tile label="Brief dikembalikan" value={t.returnedPct} suffix="%" tone={t.returnedPct > 20 ? '!bg-brand-tint text-brand-char' : ''} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Request per divisi" insight={`${d.perDivision[0].division} paling banyak mengajukan: ${d.perDivision[0].total} request.`}>
          <div style={{ height: Math.max(180, d.perDivision.length * 44) }}>
            <ResponsiveContainer>
              <BarChart data={d.perDivision} layout="vertical" margin={{ left: 10, right: 30 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="division" width={110} tick={{ fontSize: 12, fontWeight: 700, fill: 'rgb(var(--ink))' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgb(var(--ink) / .06)' }} formatter={(v) => [v, 'Request']} />
                <Bar dataKey="total" radius={[0, 8, 8, 0]} stroke="#1F1A1A" strokeWidth={2}>
                  {d.perDivision.map((x) => <Cell key={x.division} fill={x.color} />)}
                  <LabelList dataKey="total" position="right" style={{ fontWeight: 800, fill: 'rgb(var(--ink))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Kebiasaan brief per divisi"
          insight={[topUrgent && `${topUrgent.division} paling sering urgent (${pctTxt(topUrgent.urgentPct)}).`, topReturned && `${topReturned.division} paling sering dikembalikan brief-nya (${pctTxt(topReturned.returnedPct)}).`].filter(Boolean).join(' ') || 'Tidak ada request urgent atau brief dikembalikan. Rapi!'}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead><tr className="text-left text-xs text-muted">{['Divisi', 'Request', 'Urgent', 'Brief dikembalikan', 'Rata-rata revisi', 'Tepat waktu', 'Jam di pengaju'].map((h) => <th key={h} className="py-2 pr-3 font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {d.perDivision.map((x) => (
                  <tr key={x.division} className="border-t border-ink/10 font-semibold">
                    <td className="py-2 pr-3 whitespace-nowrap"><span className="inline-block w-2.5 h-2.5 rounded-full border border-ink mr-1.5" style={{ background: x.color }} />{x.emoji} {x.division}</td>
                    <td className="tabular-nums">{x.total}</td>
                    <td className={`tabular-nums ${x.urgentPct > 20 ? 'text-brand font-extrabold' : ''}`}>{pctTxt(x.urgentPct)}</td>
                    <td className={`tabular-nums ${x.returnedPct > 20 ? 'text-brand font-extrabold' : ''}`}>{pctTxt(x.returnedPct)}</td>
                    <td className="tabular-nums">{fmtNum(x.avgRevisi, 1)}</td>
                    <td className="tabular-nums">{pctTxt(x.onTimePct)}</td>
                    <td className="tabular-nums">{fmtNum(x.avgHoursWithRequester, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Jenis request" insight={`Paling sering: ${d.perType[0].type} (${d.perType[0].total}).`}>
          <div className="space-y-2">
            {d.perType.map((x, i) => (
              <div key={x.type}>
                <div className="flex justify-between text-sm font-bold"><span className="truncate pr-2">{x.type}</span><span>{x.total}</span></div>
                <div className="h-3 rounded-full bg-ink/10 overflow-hidden"><motion.div className="h-full bg-brand-orange border-r-2 border-ink" initial={{ width: 0 }} whileInView={{ width: `${(x.total / d.perType[0].total) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.05 }} /></div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Beban kerja desainer" insight={d.perDesigner.length === 0 ? 'Belum ada desainer terdaftar.' : full.length ? `${full.map((x) => x.name).join(', ')} sudah penuh.` : 'Semua desainer masih punya ruang.'}>
          <div className="space-y-3">
            {d.perDesigner.map((x) => {
              const frac = Math.min(1, x.active / x.capacity)
              return (
                <div key={x.name} className="flex items-center gap-3">
                  <Avatar name={x.name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-sm font-bold"><span className="truncate">{x.name} <span className="text-muted font-semibold">· {x.specialty}</span></span><span>{x.active}/{x.capacity} aktif · {x.selesai} selesai</span></div>
                    <div className="h-3.5 rounded-full border-2 border-ink bg-card overflow-hidden"><motion.div className="h-full" style={{ background: frac >= 1 ? '#D7191F' : frac >= 0.7 ? '#C98A1B' : '#2E7D4F' }} initial={{ width: 0 }} whileInView={{ width: `${frac * 100}%` }} viewport={{ once: true }} /></div>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel title="Tren mingguan" insight="Request masuk dan selesai per minggu (mulai Senin).">
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={d.weekly.map((w) => ({ ...w, label: fmtDate(w.week, { year: false }) }))} margin={{ left: -20, right: 10, top: 10 }}>
                <CartesianGrid stroke="rgb(var(--ink) / .1)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 700, fill: 'rgb(var(--ink))' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'rgb(var(--muted))' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="masuk" name="Masuk" stroke="#D7191F" strokeWidth={3} dot={{ r: 5, stroke: '#1F1A1A', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="selesai" name="Selesai" stroke="#2E7D4F" strokeWidth={3} dot={{ r: 5, stroke: '#1F1A1A', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="urgent" name="Urgent" stroke="#C98A1B" strokeWidth={3} strokeDasharray="5 4" dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 text-xs font-bold mt-1">
            <span className="text-brand">● Masuk</span><span className="text-brand-green">● Selesai</span><span className="text-brand-amber">┄ Urgent</span>
          </div>
        </Panel>

        <Panel title="Lewat deadline" insight={d.overdue.length ? `${d.overdue.length} request perlu perhatian.` : 'Tidak ada yang lewat deadline.'}>
          <div className="space-y-2">
            {d.overdue.map((c) => (
              <Link key={c.id} to={`/r/${c.id}`} className="flex items-center justify-between gap-2 rounded-xl border-2 border-brand p-2.5 text-sm hover:bg-brand-tint/40">
                <div className="min-w-0"><div className="font-bold truncate">{c.code} · {c.title}</div><div className="text-muted font-semibold">{c.division} · {c.designerName || 'belum ada desainer'} · {c.status}</div></div>
                <span className="font-bold text-brand whitespace-nowrap">{fmtDate(c.deadlineFinal, { year: false })}</span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
