import { useEffect, useState, useCallback } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, CartesianGrid } from 'recharts'
import { sb, fmt, mins, inp, btn, sum, avg } from './App'

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#8b5cf6', '#84cc16', '#f97316', '#14b8a6']
const SC: any = { NEW: 'bg-red-100 text-red-700', ACCEPTED: 'bg-amber-100 text-amber-700', 'UNDER MAINTENANCE': 'bg-blue-100 text-blue-700', 'WAITING FOR PRODUCTION VERIFICATION': 'bg-purple-100 text-purple-700', REOPENED: 'bg-orange-100 text-orange-700', CLOSED: 'bg-green-100 text-green-700' }
const PR: any = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
const PC: any = { CRITICAL: 'bg-red-600 text-white', HIGH: 'bg-orange-500 text-white', MEDIUM: 'bg-amber-400 text-black', LOW: 'bg-slate-300 text-black' }
const grp = (d: any[], k: string, v: (r: any) => number = () => 1, keySort = false, top = 0) => {
  const m: any = {}; d.forEach(r => { const x = r[k] || '—'; m[x] = (m[x] || 0) + v(r) })
  let a = Object.entries(m).map(([name, value]: any) => ({ name, value: Math.round(value * 10) / 10 }))
  a = keySort ? a.sort((p, q) => p.name < q.name ? -1 : 1) : a.sort((p, q) => q.value - p.value)
  return top ? a.slice(0, top) : a
}
const FILT: [string, string][] = [['department', 'Department'], ['machine_name', 'Machine'], ['machine_no', 'Machine number'], ['machine_type', 'Machine type'], ['shift', 'Shift'], ['bd_category', 'Category'], ['bd_type', 'Breakdown type'], ['priority', 'Priority'], ['status', 'Status'], ['person', 'Maintenance person']]
const opts = (rows: any[], k: string) => [...new Set(rows.map(r => r[k]).filter(Boolean))].sort() as string[]
const box = 'bg-white rounded-xl border-2 border-indigo-100 shadow'

function Viz({ t, d, type }: any) {
  const tip = <Tooltip />
  let body: any = <p className="text-sm text-slate-400 py-16 text-center">No data</p>
  if (d.length) {
    if (type === 'pie' || type === 'donut') body = <ResponsiveContainer width="100%" height={270}><PieChart><Pie data={d.slice(0, 8)} dataKey="value" nameKey="name" innerRadius={type === 'donut' ? 50 : 0} outerRadius={85} label={(e: any) => `${e.name}: ${e.value}`}>{d.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % 10]} />)}</Pie>{tip}</PieChart></ResponsiveContainer>
    else if (type === 'hbar') body = <div className="max-h-72 overflow-y-auto"><div style={{ height: Math.max(250, d.length * 34) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={d} layout="vertical" margin={{ right: 45 }}><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={90} fontSize={12} />{tip}<Bar dataKey="value" radius={[0, 6, 6, 0]}>{d.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % 10]} />)}<LabelList dataKey="value" position="right" fontSize={12} fontWeight={700} /></Bar></BarChart></ResponsiveContainer></div></div>
    else body = <div className="overflow-x-auto"><div style={{ minWidth: Math.max(d.length * 60, 320), height: 270 }}><ResponsiveContainer width="100%" height="100%">
      {type === 'line' ? <LineChart data={d} margin={{ top: 22, right: 20 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} />{tip}<Line type="monotone" dataKey="value" stroke="#ec4899" strokeWidth={3}><LabelList dataKey="value" position="top" fontSize={11} fontWeight={700} /></Line></LineChart>
        : type === 'area' ? <AreaChart data={d} margin={{ top: 22, right: 20 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} />{tip}<Area type="monotone" dataKey="value" stroke="#6366f1" fill="#a5b4fc" strokeWidth={3}><LabelList dataKey="value" position="top" fontSize={11} fontWeight={700} /></Area></AreaChart>
          : <BarChart data={d} margin={{ top: 22, right: 20 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} />{tip}<Bar dataKey="value" radius={[6, 6, 0, 0]}>{d.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % 10]} />)}<LabelList dataKey="value" position="top" fontSize={11} fontWeight={700} /></Bar></BarChart>}
    </ResponsiveContainer></div></div>
  }
  return <div className={box + ' p-3'}><div className="font-bold text-slate-800 mb-1">{t}</div>{body}</div>
}
const K = ({ t, v, c }: any) => <div className={`bg-gradient-to-br ${c} text-white rounded-xl border-2 border-white/50 shadow p-3`}><div className="text-xs font-medium opacity-90">{t}</div><div className="text-2xl font-extrabold">{v}</div></div>

export function Dash({ open, me, mode }: any) {
  const [rows, setRows] = useState<any[]>([]); const [f, setF] = useState<any>({}); const [q, setQ] = useState(''); const [sec, setSec] = useState('Overview')
  const reload = useCallback(async () => {
    const { data } = await sb.from('bd_view').select('*').order('reported_at', { ascending: false }).limit(5000)
    setRows((data || []).map((r: any) => { const day = new Date(r.reported_at).toLocaleDateString('en-CA'); return { ...r, day, ym: day.slice(0, 7), person: r.carried_out_by || r.accepted_by_name, cost: (+r.service_cost || 0) + (+r.sp_cost || 0) } }))
  }, [])
  useEffect(() => {
    reload()
    const ch = sb.channel('dash' + mode).on('postgres_changes', { event: '*', schema: 'public', table: 'breakdowns' }, reload).subscribe()
    const t = setInterval(reload, 30000)
    return () => { sb.removeChannel(ch); clearInterval(t) }
  }, [reload, mode])
  const d = rows.filter(r => (!f.from || r.day >= f.from) && (!f.to || r.day <= f.to) && FILT.every(([k]) => !f[k] || r[k] === f[k]) && (!q || (r.uid + r.machine_no + r.problem).toLowerCase().includes(q.toLowerCase())))
  const n = d.length, dt = sum(d, 'downtime_min')
  const t0 = f.from ? +new Date(f.from) : n ? Math.min(...d.map(r => +new Date(r.reported_at))) : Date.now()
  const t1 = f.to ? +new Date(f.to) + 864e5 : Date.now(); const hrs = Math.max((t1 - t0) / 36e5, 0)
  const mach = [...new Set(d.map(r => r.machine_no))] as string[]
  const mtbf = n ? Math.max(hrs * mach.length - dt / 60, 0) / n : null
  const per = (fn: (rs: any[]) => number) => mach.map(m => ({ name: m, value: Math.round(fn(d.filter(r => r.machine_no === m)) * 10) / 10 })).sort((a, b) => b.value - a.value)
  const cnt = (s: string) => d.filter(r => r.status === s).length
  const today = new Date().toLocaleDateString('en-CA')
  const S: any = {
    'Overview': [['Status split', grp(d, 'status'), 'donut'], ['Priority split', grp(d, 'priority'), 'pie'], ['Breakdown category', grp(d, 'bd_category'), 'pie'], ['Breakdowns by day', grp(d, 'day', undefined, true), 'line'], ['Breakdowns by month', grp(d, 'ym', undefined, true), 'area']],
    'Machines': [['Breakdowns by machine', grp(d, 'machine_no'), 'hbar'], ['Downtime (min) by machine', grp(d, 'machine_no', r => r.downtime_min || 0), 'hbar'], ['Top 5 breakdown machines', grp(d, 'machine_no', undefined, false, 5), 'pie'], ['By machine type', grp(d, 'machine_type'), 'donut']],
    'Departments & Shifts': [['By department', grp(d, 'department'), 'pie'], ['By shift', grp(d, 'shift'), 'donut'], ['Downtime (min) by department', grp(d, 'department', r => r.downtime_min || 0), 'bar'], ['Downtime (min) by shift', grp(d, 'shift', r => r.downtime_min || 0), 'bar'], ['By breakdown type', grp(d, 'bd_type'), 'pie']],
    'Cost & Loss': [['Production loss (₹) by machine', grp(d, 'machine_no', r => r.production_loss || 0), 'hbar'], ['Maintenance cost (₹) by machine', grp(d, 'machine_no', r => +r.service_cost || 0), 'hbar'], ['Spare cost (₹) by machine', grp(d, 'machine_no', r => +r.sp_cost || 0), 'hbar'], ['Cost (₹) by month', grp(d, 'ym', r => r.cost, true), 'area'], ['Cost split', [{ name: 'Maintenance', value: Math.round(sum(d, 'service_cost')) }, { name: 'Spares', value: Math.round(sum(d, 'sp_cost')) }, { name: 'Production loss', value: Math.round(sum(d, 'production_loss')) }].filter(x => x.value), 'donut']],
    'Reliability': [['MTTR (min) by machine', per(rs => avg(rs, 'repair_min') || 0), 'hbar'], ['MTBF (hrs) by machine', per(rs => Math.max(hrs - sum(rs, 'downtime_min') / 60, 0) / rs.length), 'hbar'], ['Avg response (min) by machine', per(rs => avg(rs, 'response_min') || 0), 'hbar'], ['Downtime (min) by month', grp(d, 'ym', r => r.downtime_min || 0, true), 'line']],
    'People': [['Breakdowns by maintenance person', grp(d, 'person'), 'hbar'], ['Reported by', grp(d, 'reported_by_name'), 'pie'], ['Verified by', grp(d, 'verified_by_name'), 'pie']]}
  const cols: [string, (r: any) => any][] = [['B/D No', r => r.bd_no], ['Unique ID', r => r.uid], ['Opening', r => fmt(r.reported_at)], ['Department', r => r.department], ['Machine', r => r.machine_name], ['M/C No', r => r.machine_no], ['M/C Type', r => r.machine_type], ['Shift', r => r.shift], ['Category', r => r.bd_category], ['B/D Type', r => r.bd_type], ['Problem', r => r.problem], ['Priority', r => r.priority], ['Status', r => r.status], ['Accepted', r => fmt(r.accepted_at)], ['Started', r => fmt(r.started_at)], ['Closing', r => fmt(r.closed_at)], ['Verified', r => fmt(r.verified_at)], ['Downtime', r => mins(r.downtime_min)], ['Response', r => mins(r.response_min)], ['Repair', r => mins(r.repair_min)], ['Prod Loss ₹', r => Math.round(r.production_loss || 0)], ['Maint Cost ₹', r => r.service_cost], ['Spare Cost ₹', r => r.sp_cost], ['Spare Used', r => r.spare_used], ['Maint Person', r => r.person], ['Verified By', r => r.verified_by_name]]
  const csv = () => {
    const e = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const s = [cols.map(c => e(c[0])).join(','), ...d.map(r => cols.map(c => e(c[1](r))).join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s], { type: 'text/csv' })); a.download = 'breakdown-register.csv'; a.click()
  }
  const queue = rows.filter(r => r.status !== 'CLOSED' && !(me.role === 'MAINTENANCE' && r.status === 'WAITING FOR PRODUCTION VERIFICATION')).sort((a, b) => (PR[a.priority] ?? 2) - (PR[b.priority] ?? 2) || +new Date(a.reported_at) - +new Date(b.reported_at))
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  const lab = 'text-xs font-semibold text-slate-600'
  return (
    <div className="space-y-4">
      {mode === 'dash' && <div className={box + ' p-4'}>
        <h3 className="font-bold text-indigo-800 mb-2">🔔 Action queue ({queue.length}) <span className="text-xs font-normal text-slate-500">highest priority and longest waiting first</span></h3>
        <div className="max-h-64 overflow-y-auto space-y-2">{queue.length === 0 && <p className="text-slate-400">Nothing pending 🎉</p>}
          {queue.map(r => <div key={r.id} onClick={() => open(r.id)} className="flex flex-wrap items-center gap-2 border-2 border-slate-200 hover:border-indigo-400 rounded-lg px-3 py-2 cursor-pointer text-sm">
            <span className={'px-2 py-0.5 rounded-full text-xs font-bold ' + PC[r.priority]}>{r.priority}</span><b>{r.uid}</b><span>{r.machine_no} {r.machine_name}</span><span className="text-slate-600 flex-1 min-w-[120px] truncate">{r.problem}</span>
            <span className={'px-2 py-0.5 rounded-full text-xs font-bold ' + SC[r.status]}>{r.status}</span><span className="text-xs text-slate-500">waiting {mins((Date.now() - +new Date(r.reported_at)) / 60000)}</span></div>)}</div></div>}
      <div className={box + ' p-4'}>
        <h3 className="font-bold text-indigo-800 mb-2">🔎 Filters</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <label className={lab}>From date<input type="date" className={inp} value={f.from || ''} onChange={set('from')} /></label>
          <label className={lab}>To date<input type="date" className={inp} value={f.to || ''} onChange={set('to')} /></label>
          {FILT.map(([k, l]) => <label key={k} className={lab}>{l}<select className={inp} value={f[k] || ''} onChange={set(k)}><option value="">All</option>{opts(rows, k).map(o => <option key={o}>{o}</option>)}</select></label>)}
          <button className="text-sm font-semibold text-indigo-700 underline self-end" onClick={() => setF({})}>Clear filters</button></div></div>
      {mode === 'dash' && <>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <K t="Total breakdowns" v={n} c="from-indigo-500 to-indigo-700" /><K t="New" v={cnt('NEW')} c="from-red-500 to-rose-600" /><K t="Accepted" v={cnt('ACCEPTED')} c="from-amber-400 to-orange-500" /><K t="Under maintenance" v={cnt('UNDER MAINTENANCE')} c="from-sky-500 to-blue-700" />
          <K t="Waiting verification" v={cnt('WAITING FOR PRODUCTION VERIFICATION')} c="from-violet-500 to-purple-700" /><K t="Reopened" v={cnt('REOPENED')} c="from-orange-500 to-red-500" /><K t="Closed" v={cnt('CLOSED')} c="from-emerald-500 to-teal-600" /><K t="Completed today" v={d.filter(r => r.completed_at?.slice(0, 10) === today).length} c="from-lime-500 to-green-600" /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <K t="Total downtime" v={mins(dt)} c="from-pink-500 to-rose-600" /><K t="Avg response" v={mins(avg(d, 'response_min'))} c="from-cyan-500 to-sky-600" /><K t="MTTR" v={mins(avg(d, 'repair_min'))} c="from-teal-500 to-emerald-600" /><K t="MTBF" v={mtbf == null ? '—' : mtbf.toFixed(1) + ' h'} c="from-indigo-500 to-violet-600" />
          <K t="Production loss" v={'₹' + Math.round(sum(d, 'production_loss'))} c="from-red-500 to-red-700" /><K t="Maintenance cost" v={'₹' + Math.round(sum(d, 'service_cost'))} c="from-amber-500 to-orange-600" /><K t="Spare cost" v={'₹' + Math.round(sum(d, 'sp_cost'))} c="from-fuchsia-500 to-purple-600" /><K t="Total cost" v={'₹' + Math.round(sum(d, 'cost'))} c="from-slate-600 to-slate-800" /></div>
        <p className="text-xs text-slate-500">MTBF = (period hours × machines with breakdowns − downtime) ÷ number of breakdowns. MTTR = average repair time (start → completion).</p>
        <div className="flex flex-wrap gap-2">{Object.keys(S).map(s => <button key={s} onClick={() => setSec(s)} className={`px-4 py-2 rounded-full border-2 font-semibold text-sm ${sec === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50'}`}>{s}</button>)}</div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{S[sec].map(([t, x, ty]: any) => <Viz key={t} t={t} d={x} type={ty} />)}</div></>}
      {mode === 'register' && <>
        <div className="flex flex-wrap gap-3 items-center"><input className={inp + ' max-w-xs'} placeholder="🔍 Search ID / machine / problem" value={q} onChange={e => setQ(e.target.value)} /><button className={btn} onClick={csv}>⬇ Export to Excel (CSV)</button><span className="text-sm text-slate-500">{n} records</span></div>
        <div className="max-h-[65vh] overflow-auto rounded-xl border-2 border-indigo-100 shadow bg-white"><table className="w-full text-sm"><thead className="bg-indigo-100 text-left sticky top-0"><tr>{cols.map(c => <th key={c[0]} className="p-2 whitespace-nowrap">{c[0]}</th>)}{me.role === 'ADMIN' && <th className="p-2">Delete</th>}</tr></thead><tbody>
          {d.map(r => <tr key={r.id} className="border-t hover:bg-indigo-50 cursor-pointer" onClick={() => open(r.id)}>{cols.map(c => <td key={c[0]} className="p-2 whitespace-nowrap">{c[0] === 'Status' ? <span className={'px-2 py-0.5 rounded-full text-xs font-bold ' + SC[r.status]}>{r.status}</span> : (c[1](r) ?? '—')}</td>)}
            {me.role === 'ADMIN' && <td className="p-2"><button title="Delete" onClick={async e => { e.stopPropagation(); if (!confirm('Delete ' + r.uid + ' permanently?')) return; const { error } = await sb.rpc('delete_breakdown', { p_id: r.id }); if (error) alert(error.message); reload() }}>🗑</button></td>}</tr>)}
        </tbody></table></div></>}
    </div>
  )
}
