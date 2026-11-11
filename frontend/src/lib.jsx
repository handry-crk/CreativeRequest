import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'

const BASE = import.meta.env.VITE_BACKEND_URL || ''
const TOKEN_KEY = 'cr_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const fileUrl = (u) => (u && u.startsWith('/api/') ? BASE + u : u)

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  const t = getToken()
  if (t) headers.Authorization = 'Bearer ' + t
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(BASE + '/api' + path, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) })
  } catch {
    throw { message: 'Tidak bisa terhubung ke server. Cek koneksi internet.' }
  }
  if (res.headers.get('content-type')?.includes('text/csv')) return res.blob()
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const d = data?.detail
    throw typeof d === 'object' && d ? { status: res.status, ...d } : { status: res.status, message: 'Terjadi kesalahan. Coba lagi.' }
  }
  return data
}

// ------------------------------------------------------------ app context
const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [settings, setSettings] = useState(null)
  const [ready, setReady] = useState(false)
  const [guest, setGuest] = useState(sessionStorage.getItem('cr_guest') === '1')
  const [sysReduce, setSysReduce] = useState(window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fn = (e) => setSysReduce(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  useEffect(() => {
    ;(async () => {
      try { setSettings(await api('/settings')) } catch { /* ditampilkan di layar */ }
      if (getToken()) {
        try { setUser(await api('/auth/me')) } catch { localStorage.removeItem(TOKEN_KEY) }
      }
      setReady(true)
    })()
  }, [])

  const reduce = sysReduce || !!user?.prefs?.reduceMotion
  const dark = !!user?.prefs?.darkMode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.classList.toggle('reduce-motion', reduce)
  }, [dark, reduce])

  const value = useMemo(() => ({
    user, settings, ready, guest, reduce,
    isLead: ['Creative Lead', 'Admin'].includes(user?.role),
    isCreative: ['Creative Lead', 'Designer', 'Admin'].includes(user?.role),
    signIn: ({ token, user }) => { localStorage.setItem(TOKEN_KEY, token); sessionStorage.removeItem('cr_guest'); setGuest(false); setUser(user) },
    signOut: () => { localStorage.removeItem(TOKEN_KEY); setUser(null) },
    enterGuest: () => { sessionStorage.setItem('cr_guest', '1'); setGuest(true) },
    setUser,
    reloadSettings: async () => setSettings(await api('/settings')),
    division: (name) => settings?.divisions.find((d) => d.name === name) || { name, code: 'LN', color: '#8A8178', emoji: '✨' },
  }), [user, settings, ready, guest, reduce])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// ------------------------------------------------------------ helpers
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
export const MONTHS_ID = MONTHS

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function fmtDate(s, { long = false, year = true } = {}) {
  if (!s) return '-'
  const d = s.length === 10 ? parseYmd(s) : new Date(s)
  const base = `${d.getDate()} ${long ? MONTHS[d.getMonth()] : MONTHS[d.getMonth()].slice(0, 3)}${year ? ' ' + d.getFullYear() : ''}`
  return long ? `${DAYS[d.getDay()]}, ${base}` : base
}
export function fmtDateTime(s) {
  if (!s) return '-'
  const d = new Date(s)
  return `${fmtDate(s, { year: false })}, ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`
}
export const fmtNum = (n, digits = 0) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: digits }))

export function usePolling(fn, ms = 8000) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    let alive = true
    const tick = () => { if (alive && !document.hidden) ref.current() }
    tick()
    const id = setInterval(tick, ms)
    const vis = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', vis)
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [ms])
}

export function useLoad(loader, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const reload = useCallback(async () => {
    try { setData(await loader()); setError(null) } catch (e) { setError(e) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { reload() }, [reload])
  return { data, error, reload, setData }
}

// ------------------------------------------------------------ perayaan
const COLORS = ['#D7191F', '#F5B800', '#F2A541', '#FFF4E0', '#1F1A1A']
const isReduced = () => document.documentElement.classList.contains('reduce-motion')

export function celebrate(kind = 'small', origin) {
  if (isReduced()) return
  if (kind === 'small') {
    confetti({ particleCount: 60, spread: 70, startVelocity: 35, colors: COLORS, origin: origin || { y: 0.8 }, disableForReducedMotion: true })
  } else if (kind === 'gold') {
    confetti({ particleCount: 120, spread: 100, colors: ['#F5B800', '#FFD84D', '#F2A541', '#FFF4E0'], origin: { y: 0.6 }, scalar: 1.1 })
  } else {
    const end = Date.now() + 1200
    ;(function frame() {
      confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: COLORS })
      confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: COLORS })
      if (Date.now() < end) requestAnimationFrame(frame)
    })()
  }
}

export function blip(enabled, type = 'pop') {
  if (!enabled) return
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)()
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(type === 'ding' ? 880 : 520, ac.currentTime)
    o.frequency.exponentialRampToValueAtTime(type === 'ding' ? 1320 : 260, ac.currentTime + 0.18)
    g.gain.setValueAtTime(0.12, ac.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25)
    o.connect(g).connect(ac.destination)
    o.start()
    o.stop(ac.currentTime + 0.26)
  } catch { /* abaikan */ }
}

// kompres gambar di browser sampai <= maxKB
export async function compressImage(file, maxKB = 300, maxSide = 1600) {
  const img = await new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = () => rej({ message: 'Berkas gambar tidak bisa dibaca.' })
    i.src = URL.createObjectURL(file)
  })
  let side = maxSide
  let q = 0.85
  for (let n = 0; n < 8; n++) {
    const scale = Math.min(1, side / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * scale)
    c.height = Math.round(img.height * scale)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q))
    if (blob.size <= maxKB * 1024 || n === 7) return new File([blob], 'gambar.jpg', { type: 'image/jpeg' })
    if (q > 0.6) q -= 0.1
    else side = Math.round(side * 0.8)
  }
}

export async function uploadImage(file, maxKB = 300) {
  const f = await compressImage(file, maxKB)
  const form = new FormData()
  form.append('file', f)
  return (await api('/files', { method: 'POST', form })).url
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

export const STATUS_STYLE = {
  Draft: 'bg-ink/10',
  'Menunggu Persetujuan Urgent': 'bg-brand text-white',
  Diajukan: 'bg-brand-cream text-brand-char',
  'Perlu Dilengkapi': 'bg-brand-tint text-brand-char',
  Antre: 'bg-card',
  Dikerjakan: 'bg-brand-orange text-brand-char',
  'Review Internal': 'bg-[#DCCBFF] text-brand-char',
  'Review Requester': 'bg-[#BFE3FF] text-brand-char',
  Revisi: 'bg-brand-tint text-brand-char',
  Disetujui: 'bg-[#C9F0D6] text-brand-char',
  Selesai: 'bg-brand-sun text-brand-char',
  Ditolak: 'bg-ink text-paper',
  Batal: 'bg-ink/20',
}

export function waReply(settings) {
  const base = settings?.publicBaseUrl || window.location.origin
  return `Halo, request desain diproses lewat form ya: ${base}/ajukan. Request lewat chat belum bisa kami proses. Terima kasih.`
}
