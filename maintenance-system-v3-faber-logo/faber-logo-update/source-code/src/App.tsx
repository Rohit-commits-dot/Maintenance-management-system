import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

import { Spares, PM, Evidence, SpareIssue } from './Extra'
import { Dash } from './Dash2'
import { ReportForm, UsersPage, MachinesPage, FormSettings } from './Admin2'

const cfg = (window as any).APP_CONFIG || {}
const url = cfg.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || ''
export const configured = url.startsWith('http')
export const sb = createClient(configured ? url : 'https://not-configured.supabase.co', cfg.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'x')
export const fmt = (t?: string | null) => t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
export const mins = (m?: number | null) => m == null ? '—' : m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`
export const inp = 'border-2 border-slate-300 focus:border-indigo-500 outline-none rounded-lg px-3 py-2 w-full text-[15px] bg-white'
export const btn = 'bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-indigo-700 shadow disabled:opacity-50'
const STATUSES = ['NEW', 'ACCEPTED', 'UNDER MAINTENANCE', 'WAITING FOR PRODUCTION VERIFICATION', 'REOPENED', 'CLOSED']
export const avg = (a: any[], k: string) => { const v = a.map(x => x[k]).filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null }
export const sum = (a: any[], k: string) => a.reduce((s, x) => s + (Number(x[k]) || 0), 0)
const group = (a: any[], k: string, val?: (x: any) => number) => {
  const m: any = {}; a.forEach(x => { const key = x[k] || '—'; m[key] = (m[key] || 0) + (val ? val(x) : 1) })
  return Object.entries(m).map(([name, value]) => ({ name, value: Math.round(Number(value)) })).sort((p, q) => q.value - p.value).slice(0, 10)
}

const NAV: [string, string, string, string[]][] = [['home', '📊', 'Dashboard', []], ['new', '📝', 'Report Breakdown', ['ADMIN', 'PRODUCTION']], ['register', '📋', 'Breakdown Register', []], ['spares', '🔧', 'Spare Parts', ['ADMIN', 'MAINTENANCE']], ['pm', '🗓️', 'Preventive Maintenance', ['ADMIN', 'MAINTENANCE']], ['machines', '🏭', 'Machines', ['ADMIN']], ['users', '👥', 'Users', ['ADMIN']], ['forms', '⚙️', 'Form Settings', ['ADMIN']], ['audit', '🧾', 'Audit Log', ['ADMIN']]]

export default function App() {
  const [me, setMe] = useState<any>(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<any>('home')
  const [side, setSide] = useState(false)
  const load = async () => {
    const { data: { session } } = await sb.auth.getSession()
    if (!session) { setMe(null); setReady(true); return }
    const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).single()
    if (!data?.active) { await sb.auth.signOut(); setMe(null) } else setMe(data)
    setReady(true)
  }
  useEffect(() => { load() }, [])
  if (!ready) return <p className="p-6">Loading…</p>
  if (!me) return <Login onDone={load} />
  const title = view?.id ? 'Breakdown Details' : (NAV.find(n => n[0] === view)?.[2] || '')
  const go = (v: any) => { setView(v); setSide(false) }
  const openBd = (id: string) => setView({ id })
  return (
    <div className="h-screen flex bg-slate-100">
      {side && <div className="fixed inset-0 bg-black/40 z-10 md:hidden" onClick={() => setSide(false)} />}
      <aside className={`fixed md:static z-20 inset-y-0 left-0 w-64 shrink-0 bg-gradient-to-b from-indigo-900 via-indigo-800 to-fuchsia-900 text-white flex flex-col transition-transform ${side ? '' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 border-b border-white/20"><div className="bg-white rounded-xl p-2 mb-3"><img src="/faber-logo.png" alt="Faber Infinite" className="w-full h-auto" /></div><div className="text-lg font-extrabold">🛠 Maintenance MS</div><div className="text-xs text-indigo-200">Breakdown &amp; Maintenance Management</div></div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">{NAV.filter(n => !n[3].length || n[3].includes(me.role)).map(n => <button key={n[0]} onClick={() => go(n[0])} className={`w-full text-left px-4 py-2.5 rounded-lg text-[15px] font-medium border-2 ${view === n[0] ? 'bg-white text-indigo-800 border-white shadow' : 'border-transparent hover:bg-white/10'}`}>{n[1]} {n[2]}</button>)}</nav>
        <div className="p-4 border-t border-white/20 text-sm"><div className="font-semibold">{me.full_name}</div><div className="text-indigo-200 mb-2">{me.role}{me.department ? ' • ' + me.department : ''}</div><button className="w-full border-2 border-white/60 rounded-lg py-1.5 hover:bg-white/10" onClick={async () => { await sb.auth.signOut(); setMe(null) }}>Logout</button></div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b-2 border-indigo-100 px-4 py-3 flex items-center gap-3">
          <button className="md:hidden text-2xl" onClick={() => setSide(true)}>☰</button>
          {view?.id && <button className="border-2 border-indigo-200 rounded-lg px-3 py-1 text-sm font-semibold" onClick={() => go('home')}>← Back</button>}
          <h1 className="text-xl md:text-2xl font-extrabold text-indigo-900">{title}</h1><div className="ml-auto flex items-center gap-4"><img src="/faber-logo.png" alt="Faber Infinite" className="h-9 w-auto hidden sm:block" /><Bell me={me} open={openBd} /></div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6"><div className="max-w-7xl mx-auto space-y-4">
          {view === 'home' && <Dash mode="dash" me={me} open={openBd} />}
          {view === 'register' && <Dash mode="register" me={me} open={openBd} />}
          {view === 'new' && <ReportForm done={openBd} />}
          {view === 'spares' && <Spares />}
          {view === 'pm' && <PM />}
          {view === 'machines' && <MachinesPage />}
          {view === 'users' && <UsersPage />}
          {view === 'forms' && <FormSettings />}
          {view === 'audit' && <Audit />}
          {view?.id && <Detail id={view.id} me={me} back={() => go('home')} />}
        </div></main>
      </div>
    </div>
  )
}

function Login({ onDone }: any) {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState('')
  const go = async (e: any) => {
    e.preventDefault()
    const { error } = await sb.auth.signInWithPassword({ email: u.trim().toLowerCase() + '@factory.local', password: p })
    if (error) return setErr('Invalid username or password')
    await sb.rpc('log_login'); onDone()
  }
  return (
    <form onSubmit={go} className="max-w-sm mx-auto mt-24 bg-white p-8 rounded-2xl border-2 border-indigo-200 shadow-xl space-y-4">
      <img src="/faber-logo.png" alt="Faber Infinite" className="h-16 mx-auto" />
      <h1 className="text-2xl font-extrabold text-indigo-800 text-center">🛠 Maintenance Management System</h1>
      <label className="block text-sm font-semibold">Username<input className={inp} value={u} onChange={e => setU(e.target.value)} /></label>
      <label className="block text-sm font-semibold">Password<input className={inp} type="password" value={p} onChange={e => setP(e.target.value)} /></label>
      {!configured && <p className="text-red-600 text-sm">Setup incomplete: open config.js and paste your Supabase URL and key.</p>}
      {err && <p className="text-red-600 text-sm">{err}</p>}
      <button className={btn + ' w-full'}>Login</button>
    </form>
  )
}

function Bell({ me, open }: any) {
  const [list, setList] = useState<any[]>([]); const [show, setShow] = useState(false); const [toast, setToast] = useState<any>(null)
  const reload = useCallback(async () => {
    const { data } = await sb.from('notifications').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(40)
    setList(data || [])
  }, [me.id])
  const beep = () => { try { const c = new (window.AudioContext || (window as any).webkitAudioContext)(); const o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(); setTimeout(() => { o.stop(); c.close() }, 250) } catch { } }
  useEffect(() => {
    reload()
    const f = { schema: 'public', table: 'notifications', filter: `user_id=eq.${me.id}` }
    const ch = sb.channel('n-' + me.id)
      .on('postgres_changes', { event: 'INSERT', ...f }, (p: any) => { reload(); setToast(p.new); beep(); setTimeout(() => setToast(null), 8000) })
      .on('postgres_changes', { event: 'UPDATE', ...f }, reload).subscribe()
    const t = setInterval(reload, 30000)
    return () => { sb.removeChannel(ch); clearInterval(t) }
  }, [reload, me.id])
  const unread = list.filter(n => !n.read).length
  const openN = async (n: any) => { await sb.from('notifications').update({ read: true }).eq('id', n.id); setShow(false); setToast(null); reload(); open(n.breakdown_id) }
  return (
    <div className="relative">
      <button className="text-2xl relative" onClick={() => setShow(!show)}>🔔{unread > 0 && <span className="absolute -top-1 -right-2 bg-red-600 text-white rounded-full px-1.5 text-xs font-bold">{unread}</span>}</button>
      {toast && <div onClick={() => openN(toast)} className="fixed top-4 right-4 z-50 w-80 bg-white border-2 border-indigo-500 rounded-xl shadow-2xl p-3 cursor-pointer"><b>🔔 {toast.title}</b><div className="text-sm">{toast.message}</div></div>}
      {show && <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-white rounded-xl border-2 border-indigo-200 shadow-xl max-h-96 overflow-auto z-30">
        <div className="flex justify-between p-2 border-b bg-indigo-50 sticky top-0"><b>Notifications</b><button className="text-xs underline" onClick={async () => { await sb.from('notifications').update({ read: true }).eq('user_id', me.id).eq('read', false); reload() }}>Mark all read</button></div>
        {list.length === 0 && <p className="p-3 text-sm">No notifications</p>}
        {list.map(n => <div key={n.id} className={'p-2 border-b cursor-pointer text-sm hover:bg-indigo-50 ' + (n.read ? '' : 'bg-indigo-50 font-medium')} onClick={() => openN(n)}><b>{n.title}</b><div>{n.message}</div><div className="text-xs text-slate-500">{fmt(n.created_at)}</div></div>)}
      </div>}
    </div>
  )
}

export const Card = ({ t, v, on }: any) => <div onClick={on} className="bg-white rounded-xl border-2 border-indigo-100 shadow p-3 cursor-pointer"><div className="text-xs text-slate-500">{t}</div><div className="text-xl font-bold">{v}</div></div>
export const Chart = ({ t, d }: any) => <div className="bg-white rounded-xl border-2 border-indigo-100 shadow p-3"><div className="text-sm font-semibold mb-1">{t}</div>
  <ResponsiveContainer width="100%" height={180}><BarChart data={d}><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Bar dataKey="value" fill="#2563eb" /></BarChart></ResponsiveContainer></div>

function Detail({ id, me, back }: any) {
  const [b, setB] = useState<any>(null); const [ev, setEv] = useState<any[]>([]); const [f, setF] = useState<any>({}); const [err, setErr] = useState(''); const [reason, setReason] = useState('')
  const [x, setX] = useState<any>({})
  useEffect(() => { sb.from('breakdowns').select('extra').eq('id', id).single().then(({ data }) => setX(data?.extra || {})) }, [id])
  const reload = useCallback(async () => {
    const [{ data }, { data: e }] = await Promise.all([sb.from('bd_view').select('*').eq('id', id).single(), sb.from('breakdown_events').select('*').eq('breakdown_id', id).order('at')])
    setB(data); setEv(e || [])
  }, [id])
  useEffect(() => {
    reload()
    const ch = sb.channel('d' + id).on('postgres_changes', { event: '*', schema: 'public', table: 'breakdowns', filter: `id=eq.${id}` }, reload).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [reload, id])
  const act = async (a: string, p: any = {}) => { const { error } = await sb.rpc('bd_action', { p_id: id, p_action: a, p }); setErr(error?.message || ''); reload() }
  if (!b) return <p>Loading…</p>
  const m = me.role === 'MAINTENANCE' || me.role === 'ADMIN'; const pr = me.role === 'PRODUCTION' || me.role === 'ADMIN'
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  const Row = ({ k, v }: any) => <div className="flex text-sm"><span className="w-44 text-slate-500">{k}</span><span>{v ?? '—'}</span></div>
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-white p-4 rounded-xl border-2 border-indigo-100 shadow space-y-1">
        <h2 className="font-bold text-lg">{b.uid} <span className="text-sm bg-slate-200 rounded px-2">{b.status}</span></h2>
        <Row k="B/D No" v={b.bd_no} /><Row k="Machine" v={`${b.machine_no} – ${b.machine_name} (${b.machine_type || ''})`} /><Row k="Department / Shift" v={`${b.department || '—'} / ${b.shift}`} />
        <Row k="Category / Type" v={`${b.bd_category} / ${b.bd_type}`} /><Row k="Priority" v={b.priority} /><Row k="Problem" v={b.problem} />{Object.entries(x).map(([k, v]) => <Row key={k} k={k} v={String(v)} />)}
        <Row k="Reported" v={`${fmt(b.reported_at)} by ${b.reported_by_name}`} /><Row k="Accepted" v={`${fmt(b.accepted_at)} ${b.accepted_by_name || ''}`} />
        <Row k="Started" v={`${fmt(b.started_at)} ${b.started_by_name || ''}`} /><Row k="Completed" v={fmt(b.completed_at)} />
        <Row k="Verified" v={`${fmt(b.verified_at)} ${b.verified_by_name || ''}`} /><Row k="Closed" v={fmt(b.closed_at)} />
        <Row k="Response / Repair / Downtime" v={`${mins(b.response_min)} / ${mins(b.repair_min)} / ${mins(b.downtime_min)}`} />
        <Row k="Root cause" v={b.root_cause} /><Row k="Action taken" v={b.action_taken} /><Row k="Delay reason" v={b.delay_reason} /><Row k="Spare used" v={b.spare_used} />
        <Row k="Carried out by" v={b.carried_out_by} /><Row k="Service / Spare cost" v={`₹${b.service_cost} / ₹${b.sp_cost}`} /><Row k="Production loss" v={'₹' + Math.round(b.production_loss || 0)} />
        <Row k="Maint. remarks" v={b.m_remarks} /><Row k="Reopen reason" v={b.reopen_reason} />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <div className="pt-3 space-y-2">
          {(me.role === 'ADMIN' || (b.reported_by === me.id && b.status === 'NEW')) && <button className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold" onClick={async () => { if (!confirm('Delete ' + b.uid + ' permanently?')) return; const { error } = await sb.rpc('delete_breakdown', { p_id: id }); if (error) setErr(error.message); else back() }}>🗑 Delete breakdown</button>}
          {m && ['NEW', 'REOPENED'].includes(b.status) && <button className={btn} onClick={() => act('accept')}>ACCEPT</button>}
          {m && b.status === 'ACCEPTED' && <button className={btn} onClick={() => act('start')}>START MAINTENANCE</button>}
          {m && b.status === 'UNDER MAINTENANCE' && <div className="space-y-1">
            {[['root_cause', 'Root cause'], ['action_taken', 'Action taken'], ['delay_reason', 'Reason for delay'], ['spare_used', 'Other spare used (text)'], ['carried_out_by', 'Carried out by'], ['service_cost', 'Service cost'], ['sp_cost', 'Extra spare cost (non-stock)'], ['m_remarks', 'Remarks']].map(([k, l]) => <input key={k} className={inp} placeholder={l} onChange={set(k)} />)}
            <SpareIssue id={id} done={reload} /><button className={btn} onClick={() => act('complete', f)}>COMPLETE MAINTENANCE</button></div>}
          {pr && b.status === 'WAITING FOR PRODUCTION VERIFICATION' && <div className="space-y-1">
            <input className={inp} placeholder="Reopen reason (required if NOT OK)" value={reason} onChange={e => setReason(e.target.value)} />
            <button className={btn} onClick={() => act('verify', { ok: true })}>MACHINE OK</button>{' '}
            <button className="bg-red-600 text-white rounded px-3 py-1 text-sm" onClick={() => act('verify', { ok: false, reason })}>MACHINE NOT OK</button></div>}
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl border-2 border-indigo-100 shadow">
        <Evidence b={b} kind="production" can={pr} reload={reload} /><Evidence b={b} kind="maintenance" can={m} reload={reload} /><Evidence b={b} kind="verification" can={pr} reload={reload} />
        <h3 className="font-bold mb-2">Timeline</h3>
        {ev.map(e => <div key={e.id} className="border-l-2 border-blue-500 pl-3 pb-3"><div className="text-xs text-slate-500">{fmt(e.at)}</div><div className="text-sm font-medium">{e.event}</div><div className="text-xs">by {e.user_name} ({e.role})</div></div>)}
      </div>
    </div>
  )
}

function Audit() {
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { sb.from('audit_logs').select('*').order('at', { ascending: false }).limit(300).then(({ data }) => setRows(data || [])) }, [])
  return (
    <div className="max-h-[65vh] overflow-auto rounded-xl border-2 border-indigo-100 shadow"><table className="w-full bg-white text-sm"><thead className="bg-indigo-100 text-left sticky top-0"><tr>{['When', 'User', 'Role', 'Action', 'Record', 'Old', 'New'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
      {rows.map(r => <tr key={r.id} className="border-t"><td className="p-2 whitespace-nowrap">{fmt(r.at)}</td><td>{r.user_name}</td><td>{r.role}</td><td>{r.action}</td><td>{r.record_id}</td><td>{r.old_value}</td><td>{r.new_value}</td></tr>)}
    </tbody></table></div>
  )
}
