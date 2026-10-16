import { useEffect, useState, useCallback } from 'react'
import { sb, fmt, inp, btn, Card } from './App'
import { Section, Fields } from './Admin2'

const today = () => new Date().toLocaleDateString('en-CA')
const opts = (rows: any[], k: string) => [...new Set(rows.map(r => r[k]).filter(Boolean))].sort() as string[]
const grp = (d: any[], k: string, v: (r: any) => number = () => 1, keySort = false, top = 0) => {
  const m: any = {}; d.forEach(r => { const x = r[k] || '—'; m[x] = (m[x] || 0) + v(r) })
  let a = Object.entries(m).map(([name, value]: any) => ({ name, value: Math.round(value * 10) / 10 }))
  a = keySort ? a.sort((p, q) => p.name < q.name ? -1 : 1) : a.sort((p, q) => q.value - p.value)
  return top ? a.slice(0, top) : a
}
const FILT: [string, string][] = [['department', 'Department'], ['machine_name', 'Machine'], ['machine_no', 'Machine Number'], ['machine_type', 'Machine Type'], ['shift', 'Shift'], ['bd_category', 'Category'], ['bd_type', 'Breakdown Type'], ['priority', 'Priority'], ['status', 'Status'], ['person', 'Maintenance Person']]
const ST = ['NEW', 'ACCEPTED', 'UNDER MAINTENANCE', 'WAITING FOR PRODUCTION VERIFICATION', 'REOPENED', 'CLOSED']

async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  const img = await createImageBitmap(file); const k = Math.min(1, 1280 / Math.max(img.width, img.height))
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  const blob: Blob = await new Promise(r => c.toBlob(x => r(x!), 'image/jpeg', 0.7))
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
}
export async function uploadEvidence(id: string, kind: string, file: File) {
  file = await shrink(file).catch(() => file)
  const path = `${id}/${kind}-${Date.now()}-${file.name.replace(/[^\w.]/g, '_')}`
  const { error } = await sb.storage.from('evidence').upload(path, file)
  if (error) return alert(error.message)
  const { data } = sb.storage.from('evidence').getPublicUrl(path)
  const { error: e2 } = await sb.rpc('set_evidence', { p_id: id, p_kind: kind, p_url: data.publicUrl })
  if (e2) alert(e2.message)
}
export function Evidence({ b, kind, can, reload }: any) {
  const raw = kind === 'production' ? b.photo_url : kind === 'maintenance' ? b.m_evidence : b.v_evidence
  const urls = (raw || '').split(',').filter(Boolean)
  const up = async (e: any) => { const file = e.target.files?.[0]; if (file) { await uploadEvidence(b.id, kind, file); reload() } }
  return (
    <div className="mb-4"><h3 className="font-bold capitalize">{kind} evidence</h3>
      <div className="flex flex-wrap gap-2 my-1">{urls.length === 0 && <span className="text-sm text-slate-500">None</span>}
        {urls.map((u: string) => <a key={u} href={u} target="_blank">{/\.(png|jpe?g|webp|gif)$/i.test(u) ? <img src={u} className="h-20 rounded border" /> : <span className="underline text-sm">file</span>}</a>)}</div>
      {can && <div className="text-sm flex gap-3"><label className="underline cursor-pointer">📷 Capture<input type="file" accept="image/*" capture="environment" hidden onChange={up} /></label>
        <label className="underline cursor-pointer">⬆ Upload<input type="file" accept="image/*,application/pdf" hidden onChange={up} /></label></div>}
    </div>
  )
}

export function SpareIssue({ id, done }: any) {
  const [sp, setSp] = useState<any[]>([]); const [s, setS] = useState(''); const [qty, setQty] = useState('1')
  useEffect(() => { sb.from('spares').select('*').order('name').then(({ data }) => setSp(data || [])) }, [])
  const go = async () => { const { error } = await sb.rpc('spare_txn', { p_spare: s, p_kind: 'OUT', p_qty: Number(qty), p_bd: id }); if (error) alert(error.message); else { done(); sb.from('spares').select('*').order('name').then(({ data }) => setSp(data || [])) } }
  return <div className="flex gap-1 items-center border rounded p-1"><select className={inp} value={s} onChange={e => setS(e.target.value)}><option value="">Issue spare from stock…</option>{sp.map(x => <option key={x.id} value={x.id}>{x.part_no} {x.name} (stock {x.stock})</option>)}</select>
    <input className={inp + ' w-20'} value={qty} onChange={e => setQty(e.target.value)} /><button className={btn} disabled={!s} onClick={go}>Issue</button></div>
}

export function Spares() {
  const [list, setList] = useState<any[]>([]); const [tx, setTx] = useState<any[]>([]); const [mc, setMc] = useState<any[]>([]); const [us, setUs] = useState<any>({})
  const [f, setF] = useState<any>({}); const [t, setT] = useState<any>({ kind: 'IN' }); const [msg, setMsg] = useState('')
  const reload = async () => {
    setList((await sb.from('spares').select('*,machines(machine_no)').order('name')).data || [])
    setTx((await sb.from('spare_txns').select('*,spares(part_no,name),breakdowns(uid)').order('at', { ascending: false }).limit(200)).data || [])
    setMc((await sb.from('machines').select('id,machine_no').order('machine_no')).data || [])
    const m: any = {}; ((await sb.from('profiles').select('id,full_name')).data || []).forEach((p: any) => m[p.id] = p.full_name); setUs(m)
  }
  useEffect(() => { reload() }, [])
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  const add = async () => {
    const n = (k: string) => Number(f[k]) || 0
    const { error } = await sb.from('spares').insert({ part_no: f.part_no, name: f.name, machine_id: f.machine_id || null, stock: n('stock'), min_stock: n('min_stock'), max_stock: n('max_stock'), supplier: f.supplier, unit_cost: n('unit_cost') })
    setMsg(error?.message || 'Saved'); reload()
  }
  const txn = async () => { const { error } = await sb.rpc('spare_txn', { p_spare: t.spare, p_kind: t.kind, p_qty: Number(t.qty) }); setMsg(error?.message || 'Transaction saved'); reload() }
  return (
    <div className="space-y-4">
      <Section title="➕ Add spare part"><Fields spec={[{ k: 'part_no', label: 'Part number', req: 1 }, { k: 'name', label: 'Part name', req: 1 }, { k: 'machine_id', label: 'Machine (optional)', type: 'select', options: mc.map(m => ({ v: m.id, t: m.machine_no })) }, { k: 'stock', label: 'Opening stock', type: 'number' }, { k: 'min_stock', label: 'Minimum stock', type: 'number' }, { k: 'max_stock', label: 'Maximum stock', type: 'number' }, { k: 'supplier', label: 'Supplier' }, { k: 'unit_cost', label: 'Unit cost (₹)', type: 'number' }]} v={f} set={setF} /><button className={btn + ' mt-3'} onClick={add}>Save spare</button></Section>
      <div className="bg-white p-4 rounded-xl border-2 border-indigo-100 shadow flex flex-wrap gap-2 items-center"><b className="w-full">🔄 Stock transaction (IN / OUT / ADJUSTMENT)</b>
        <select className={inp + ' max-w-xs'} onChange={e => setT({ ...t, spare: e.target.value })}><option value="">Spare…</option>{list.map(s => <option key={s.id} value={s.id}>{s.part_no} {s.name}</option>)}</select>
        <select className={inp + ' w-36'} value={t.kind} onChange={e => setT({ ...t, kind: e.target.value })}>{['IN', 'OUT', 'ADJUSTMENT'].map(k => <option key={k}>{k}</option>)}</select>
        <input className={inp + ' w-28'} placeholder={t.kind === 'ADJUSTMENT' ? 'New stock' : 'Qty'} onChange={e => setT({ ...t, qty: e.target.value })} />
        <button className={btn} onClick={txn}>Post transaction</button><span className="text-sm">{msg}</span>
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-xl border-2 border-indigo-100 shadow"><table className="w-full bg-white text-sm"><thead className="bg-indigo-100 text-left sticky top-0"><tr>{['Part No', 'Name', 'Machine', 'Stock', 'Min', 'Max', 'Supplier', 'Unit Cost', 'Status', ''].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {list.map(s => <tr key={s.id} className="border-t"><td className="p-2">{s.part_no}</td><td>{s.name}</td><td>{s.machines?.machine_no}</td><td className="font-bold">{s.stock}</td><td>{s.min_stock}</td><td>{s.max_stock}</td><td>{s.supplier}</td><td>₹{s.unit_cost}</td>
          <td className={s.stock <= s.min_stock ? 'text-red-600 font-semibold' : ''}>{s.stock <= s.min_stock ? 'LOW – reorder' : s.max_stock && s.stock > s.max_stock ? 'Over max' : 'OK'}</td><td className="p-2"><button title="Delete" onClick={async () => { if (!confirm('Delete ' + s.name + '?')) return; const { error } = await sb.from('spares').delete().eq('id', s.id); if (error) alert('Cannot delete: this part has stock transactions.'); reload() }}>🗑</button></td></tr>)}
      </tbody></table></div>
      <h3 className="font-bold">Transactions (when / who / which breakdown)</h3>
      <div className="max-h-[60vh] overflow-auto rounded-xl border-2 border-indigo-100 shadow"><table className="w-full bg-white text-sm"><thead className="bg-indigo-100 text-left sticky top-0"><tr>{['Date & Time', 'Part', 'Type', 'Qty', 'Breakdown', 'By'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {tx.map(x => <tr key={x.id} className="border-t"><td className="p-2 whitespace-nowrap">{fmt(x.at)}</td><td>{x.spares?.part_no} {x.spares?.name}</td><td>{x.kind}</td><td>{x.qty}</td><td>{x.breakdowns?.uid || '—'}</td><td>{us[x.by_user]}</td></tr>)}
      </tbody></table></div>
    </div>
  )
}

export function PM() {
  const [ms, setMs] = useState<any[]>([]); const [sc, setSc] = useState<any[]>([]); const [mc, setMc] = useState<any[]>([])
  const [f, setF] = useState<any>({ freq: 30, first: today() }); const [openId, setOpenId] = useState(''); const [chk, setChk] = useState<any>({}); const [rem, setRem] = useState(''); const [msg, setMsg] = useState('')
  const reload = async () => {
    setSc((await sb.from('pm_schedule').select('*,pm_master(task,checklist,frequency_days,machines(machine_no,name))').order('due_date')).data || [])
    setMc((await sb.from('machines').select('id,machine_no,name').order('machine_no')).data || [])
  }
  useEffect(() => { reload() }, [])
  const t = today(), soon = new Date(Date.now() + 7 * 864e5).toLocaleDateString('en-CA')
  const st = (s: any) => s.completed_at ? 'COMPLETED' : s.due_date < t ? 'OVERDUE' : s.due_date <= soon ? 'DUE' : 'PLANNED'
  const c = (k: string) => sc.filter(s => st(s) === k).length
  const onTime = sc.filter(s => s.completed_at && new Date(s.completed_at).toLocaleDateString('en-CA') <= s.due_date).length
  const base = c('COMPLETED') + c('OVERDUE'); const comp = base ? Math.round(100 * onTime / base) : 100
  const add = async () => {
    const { error } = await sb.rpc('pm_add', { p_machine: f.machine, p_task: f.task, p_freq: Number(f.freq), p_checklist: (f.list || '').split(',').map((x: string) => x.trim()).filter(Boolean), p_first: f.first })
    setMsg(error?.message || 'PM added'); reload()
  }
  const finish = async (s: any) => {
    const items = (s.pm_master.checklist || []).map((i: string) => ({ item: i, ok: !!chk[i] }))
    const { error } = await sb.rpc('pm_complete', { p_id: s.id, p_result: { items, remarks: rem } })
    if (error) alert(error.message); else { setOpenId(''); setChk({}); setRem(''); reload() }
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2"><Card t="PM Planned" v={sc.length} /><Card t="PM Due (7 days)" v={c('DUE')} /><Card t="PM Completed" v={c('COMPLETED')} /><Card t="PM Overdue" v={c('OVERDUE')} /><Card t="PM Compliance %" v={comp + '%'} /></div>
      <Section title="➕ Add PM plan"><Fields spec={[{ k: 'machine', label: 'Machine', type: 'select', req: 1, options: mc.map(m => ({ v: m.id, t: m.machine_no + ' ' + m.name })) }, { k: 'task', label: 'PM task', req: 1 }, { k: 'freq', label: 'Repeat every (days)', type: 'number' }, { k: 'first', label: 'First due date', type: 'date' }, { k: 'list', label: 'Checklist (separate items with commas)', type: 'textarea' }]} v={f} set={setF} /><div className="mt-3 flex items-center gap-3"><button className={btn} onClick={add}>Save PM plan</button><span className="text-sm font-medium">{msg}</span></div></Section>
      <div className="max-h-[60vh] overflow-auto rounded-xl border-2 border-indigo-100 shadow"><table className="w-full bg-white text-sm"><thead className="bg-indigo-100 text-left sticky top-0"><tr>{['Machine', 'PM Task', 'Due', 'Status', 'Completed', '', ''].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {sc.map(s => <><tr key={s.id} className="border-t"><td className="p-2">{s.pm_master?.machines?.machine_no} {s.pm_master?.machines?.name}</td><td>{s.pm_master?.task}</td><td>{s.due_date}</td>
          <td className={st(s) === 'OVERDUE' ? 'text-red-600 font-semibold' : ''}>{st(s)}</td><td>{fmt(s.completed_at)}</td>
          <td>{!s.completed_at && <button className="underline" onClick={() => { setOpenId(openId === s.id ? '' : s.id); setChk({}) }}>Execute</button>}</td><td className="p-2"><button title="Delete PM plan" onClick={async () => { if (!confirm('Delete this PM plan and its schedule?')) return; await sb.from('pm_schedule').delete().eq('pm_id', s.pm_id); await sb.from('pm_master').delete().eq('id', s.pm_id); reload() }}>🗑</button></td></tr>
          {openId === s.id && <tr key={s.id + 'x'}><td colSpan={7} className="p-3 bg-slate-50 space-y-1">
            {(s.pm_master.checklist || []).map((i: string) => <label key={i} className="block"><input type="checkbox" checked={!!chk[i]} onChange={e => setChk({ ...chk, [i]: e.target.checked })} /> {i}</label>)}
            <input className={inp} placeholder="Remarks" onChange={e => setRem(e.target.value)} /><button className={btn} onClick={() => finish(s)}>Complete PM</button></td></tr>}</>)}
      </tbody></table></div>
    </div>
  )
}
