import { lazy, Suspense } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { BarChart3, Images, LayoutGrid, ListChecks, LogIn, MessageCircle, Palette, Plus, Settings, UserRound } from 'lucide-react'
import { copyText, useApp, waReply } from './lib.jsx'
import { Avatar, Btn, Empty, Mascot, Skeleton, spring } from './ui.jsx'
import Login from './pages/Login.jsx'
import Queue from './pages/Queue.jsx'

const Wizard = lazy(() => import('./pages/Wizard.jsx'))
const Detail = lazy(() => import('./pages/Detail.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const lazyNamed = (name) => lazy(() => import('./pages/More.jsx').then((m) => ({ default: m[name] })))
const MyRequests = lazyNamed('MyRequests')
const Gallery = lazyNamed('Gallery')
const BrandKit = lazyNamed('BrandKit')
const SettingsPage = lazyNamed('SettingsPage')
const Profile = lazyNamed('Profile')

const NAV = [
  { to: '/', label: 'Antrean', icon: LayoutGrid, end: true },
  { to: '/saya', label: 'Request Saya', icon: ListChecks, auth: true },
  { to: '/galeri', label: 'Galeri', icon: Images },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3, auth: true },
  { to: '/brand-kit', label: 'Brand Kit', icon: Palette },
  { to: '/pengaturan', label: 'Pengaturan', icon: Settings, lead: true },
]

function Shell({ children }) {
  const { user, isLead, isCreative, settings } = useApp()
  const nav = useNavigate()
  const items = NAV.filter((n) => (!n.auth || user) && (!n.lead || isLead))
  const copyWa = async () => {
    const ok = await copyText(waReply(settings))
    ok ? toast.success('Balasan WA tersalin. Tinggal tempel di chat.') : toast.error('Gagal menyalin.')
  }
  return (
    <div className="md:flex min-h-dvh">
      {/* sidebar desktop */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-brand text-white border-r-2 border-ink sticky top-0 h-dvh">
        <Link to="/" className="px-5 pt-6 pb-4 block">
          <div className="title-xl text-3xl">Creative<br />Request</div>
          <div className="text-xs font-bold mt-1 opacity-90">CRK Group · Cimol Bojot AA</div>
        </Link>
        <div className="checker h-2 border-y-2 border-ink" />
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex items-center gap-3 px-3 min-h-[44px] rounded-xl font-bold border-2 ${isActive ? 'bg-brand-cream text-brand-char border-ink shadow-pop-sm' : 'border-transparent hover:bg-white/15'}`}>
              <n.icon size={19} /> {n.label}
            </NavLink>
          ))}
          {user && (
            <motion.button whileTap={{ scale: 0.96 }} whileHover={{ y: -2, rotate: -1 }} onClick={() => nav('/ajukan')}
              className="w-full mt-3 flex items-center justify-center gap-2 min-h-[52px] rounded-xl bg-brand-sun text-brand-char border-2 border-ink shadow-pop font-display font-extrabold text-lg">
              <Plus size={22} strokeWidth={3} /> Ajukan
            </motion.button>
          )}
          {isCreative && (
            <button onClick={copyWa} className="w-full mt-2 flex items-center gap-2 px-3 min-h-[44px] rounded-xl text-sm font-bold hover:bg-white/15">
              <MessageCircle size={18} /> Salin balasan WA
            </button>
          )}
        </nav>
        <div className="p-3 border-t-2 border-ink">
          {user ? (
            <Link to="/profil" className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/15">
              <Avatar user={user} />
              <div className="min-w-0">
                <div className="font-bold truncate">{user.name}</div>
                <div className="text-xs opacity-90 truncate">{user.role} · {user.division}</div>
              </div>
            </Link>
          ) : (
            <Link to="/masuk" className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl font-bold hover:bg-white/15"><LogIn size={18} /> Masuk</Link>
          )}
        </div>
      </aside>

      {/* header mobile */}
      <header className="md:hidden sticky top-0 z-30 bg-brand text-white border-b-2 border-ink flex items-center justify-between px-4 h-14">
        <Link to="/" className="title-xl text-xl">Creative Request</Link>
        {user ? <Link to="/profil" aria-label="Profil"><Avatar user={user} size={34} /></Link> : <Link to="/masuk" className="font-bold text-sm underline">Masuk</Link>}
      </header>

      <main className="flex-1 min-w-0 px-3 md:px-8 pt-4 md:pt-8 pb-28 md:pb-12 max-w-[1500px]">{children}</main>

      {/* nav bawah mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t-2 border-ink grid grid-cols-5 items-end pb-[env(safe-area-inset-bottom)]">
        <BottomLink to="/" icon={LayoutGrid} label="Antrean" end />
        {user ? <BottomLink to="/saya" icon={ListChecks} label="Saya" /> : <BottomLink to="/brand-kit" icon={Palette} label="Brand Kit" />}
        <div className="flex justify-center">
          <motion.button
            initial={{ y: 30 }} animate={{ y: [30, -14, 0] }} transition={{ duration: 0.6 }} whileTap={{ scale: 0.9 }}
            onClick={() => nav(user ? '/ajukan' : '/masuk')} aria-label="Ajukan request"
            className="-mt-6 w-16 h-16 rounded-full bg-brand text-white border-2 border-ink shadow-pop flex items-center justify-center">
            <Plus size={30} strokeWidth={3} />
          </motion.button>
        </div>
        <BottomLink to="/galeri" icon={Images} label="Galeri" />
        {user ? <BottomLink to="/profil" icon={UserRound} label="Lainnya" /> : <BottomLink to="/masuk" icon={LogIn} label="Masuk" />}
      </nav>
    </div>
  )
}

function BottomLink({ to, icon: Icon, label, end }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-bold ${isActive ? 'text-brand' : 'text-muted'}`}>
      <Icon size={21} />{label}
    </NavLink>
  )
}

function Page({ children }) {
  return (
    <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
      <Suspense fallback={<Skeleton rows={4} />}>{children}</Suspense>
    </motion.div>
  )
}

function NeedAuth({ children, lead }) {
  const { user, isLead } = useApp()
  const loc = useLocation()
  if (!user) return <Navigate to="/masuk" state={{ from: loc.pathname }} replace />
  if (lead && !isLead) return <Empty mood="bingung" title="Halaman ini khusus Creative Lead."><Link className="btn" to="/">Kembali ke Antrean</Link></Empty>
  return children
}

function NotFound() {
  return <Empty mood="bingung" title="Halaman ini belum didesain."><Link className="btn-primary" to="/">Kembali ke Antrean</Link></Empty>
}

export default function App() {
  const { ready, user, guest, reduce, settings } = useApp()
  const loc = useLocation()
  if (!ready) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3">
        <Mascot mood="semangat" size={120} />
        <p className="font-display font-extrabold text-xl">Lagi diracik…</p>
        <div className="checker w-40 h-2 rounded-full border-2 border-ink" />
      </div>
    )
  }
  if (!settings) {
    return <Empty mood="panik" title="Server belum bisa dihubungi."><Btn kind="primary" onClick={() => window.location.reload()}>Coba lagi</Btn></Empty>
  }
  const needLogin = !user && !guest
  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'user'} transition={spring}>
      <Toaster position="top-center" richColors toastOptions={{ style: { border: '2px solid #1F1A1A', borderRadius: 14, fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 600 } }} />
      {needLogin || loc.pathname === '/masuk' ? (
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      ) : (
        <Shell>
          <AnimatePresence mode="wait" initial={false}>
            <Routes location={loc} key={loc.pathname}>
              <Route path="/" element={<Page><Queue /></Page>} />
              <Route path="/ajukan" element={<NeedAuth><Page><Wizard /></Page></NeedAuth>} />
              <Route path="/ajukan/:id" element={<NeedAuth><Page><Wizard /></Page></NeedAuth>} />
              <Route path="/saya" element={<NeedAuth><Page><MyRequests /></Page></NeedAuth>} />
              <Route path="/r/:id" element={<NeedAuth><Page><Detail /></Page></NeedAuth>} />
              <Route path="/galeri" element={<Page><Gallery /></Page>} />
              <Route path="/dashboard" element={<NeedAuth><Page><Dashboard /></Page></NeedAuth>} />
              <Route path="/brand-kit" element={<Page><BrandKit /></Page>} />
              <Route path="/pengaturan" element={<NeedAuth lead><Page><SettingsPage /></Page></NeedAuth>} />
              <Route path="/profil" element={<NeedAuth><Page><Profile /></Page></NeedAuth>} />
              <Route path="*" element={<Page><NotFound /></Page>} />
            </Routes>
          </AnimatePresence>
        </Shell>
      )}
    </MotionConfig>
  )
}
