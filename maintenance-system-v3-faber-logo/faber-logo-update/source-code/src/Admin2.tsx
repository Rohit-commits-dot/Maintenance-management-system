import { useEffect, useState, useCallback } from 'react'
import { sb, inp, btn } from './App'
import { uploadEvidence } from './Extra'

export const Section = ({ title, children }: any) => <div className="bg-white rounded-xl border-2 border-indigo-100 shadow p-5"><h3 className="text-lg font-bold text-indigo-800 mb-3">{title}</h3>{children}</div>
export function Fields({ spec, v, set }: any) {
  const ch = (k: string) => (e: any) => set({ ...v, [k]: e.target.value })
  return <div className="grid md:grid-cols-3 gap-4">{spec.map((s: any) => (
    <label key={s.k} className={'block ' + (s.type === 'textarea' ? 'md:col-span-3' : '')}>
      <span className="block text-sm font-semibold text-slate-700 mb-1">{s.label}{s.req ? <span className="text-red-500"> *</span> : ''}</span>
      {s.type === 'select' ? <select className={inp} value={v[s.k] || ''} onChange={ch(s.k)}><option value="">Select…</option>{(s.options || []).map((o: any) => typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.v} value={o.v}>{o.t}</option>)}</select>
        : s.type === 'textarea' ? <textarea rows={3} className={inp} value={v[s.k] || ''} onChange={ch(s.k)} />
        : <input type={s.type || 'text'} className={inp} value={v[s.k] || ''} onChange={ch(s.k)} />}
      {s.hint && <span className="text-xs text-slate-500">{s.hint}</span>}
    </label>))}</div>
}
const missing = (spec: any[], v: any) => spec.filter(s => s.req && !v[s.k]).map(s => s.label)
const RB: any = { ADMIN: 'bg-purple-100 text-purple-700', PRODUCTION: 'bg-sky-100 text-sky-700', MAINTENANCE: 'bg-emerald-100 text-emerald-700' }
const TW = 'max-h-[60vh] overflow-auto rounded-xl border-2 border-indigo-100 shadow'
const TH = 'bg-indigo-100 text-left sticky top-0'

export function useCfg() {
  const [o, setO] = useState<any>({ shift: [], bd_category: [], bd_type: [] }); const [fields, setFields] = useState<any[]>([])
  const load = useCallback(async () => {
    const { data: a } = await sb.from('form_options').select('*').order('sort').order('value')
    const m: any = { shift: [], bd_category: [], bd_type: [] }; (a || []).forEach((x: any) => { (m[x.kind] = m[x.kind] || []).push(x) })
    setO(m); setFields((await sb.from('form_fields').select('*').eq('active', true).order('sort').order('id')).data || [])
  }, [])
  useEffect(() => { load() }, [load])
  return { o, fields, load }
}

export function ReportForm({ done }: any) {
  const { o, fields } = useCfg(); const [machines, setMachines] = useState<any[]>([]); const [v, setV] = useState<any>({ priority: 'MEDIUM', stopped: 'Yes' })
  const [file, setFile] = useState<File | null>(null); const [prev, setPrev] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { sb.from('machines').select('*').eq('active', true).order('machine_no').then(({ data }) => setMachines(data || [])) }, [])
  const spec: any[] = [
    { k: 'machine_id', label: 'Machine', type: 'select', req: 1, options: machines.map(m => ({ v: m.id, t: `${m.machine_no} – ${m.name}` })) },
    { k: 'shift', label: 'Shift', type: 'select', req: 1, options: o.shift.map((x: any) => x.value) },
    { k: 'priority', label: 'Priority', type: 'select', req: 1, options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    { k: 'bd_category', label: 'Breakdown category', type: 'select', req: 1, options: o.bd_category.map((x: any) => x.value) },
    { k: 'bd_type', label: 'Type of breakdown', type: 'select', req: 1, options: o.bd_type.map((x: any) => x.value) },
    { k: 'stopped', label: 'Is the machine stopped?', type: 'select', options: ['Yes', 'No'] },
    { k: 'problem', label: 'Problem description', type: 'textarea', req: 1, hint: 'Describe what happened, what you saw or heard.' },
    ...fields.map((f: any) => ({ k: 'x_' + f.id, label: f.label, req: f.required, type: f.ftype === 'select' ? 'select' : f.ftype, options: (f.options || '').split(',').map((s: string) => s.trim()).filter(Boolean) }))]
  const pick = (e: any) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPrev(URL.createObjectURL(f)) } }
  const submit = async () => {
    const m = missing(spec, v); if (m.length) return setErr('Please fill: ' + m.join(', '))
    setBusy(true); setErr('')
    const extra: any = {}; fields.forEach((f: any) => { if (v['x_' + f.id]) extra[f.label] = v['x_' + f.id] })
    const { data, error } = await sb.rpc('report_breakdown', { p: { machine_id: v.machine_id, shift: v.shift, bd_category: v.bd_category, bd_type: v.bd_type, priority: v.priority, problem: v.problem, machine_stopped: v.stopped !== 'No', extra } })
    if (error) { setBusy(false); return setErr(error.message) }
    if (file) await uploadEvidence(data, 'production', file)
    done(data)
  }
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Section title="📝 Breakdown details"><Fields spec={spec} v={v} set={setV} /></Section>
      <Section title="📷 Photo evidence (optional)">
        <div className="flex flex-wrap gap-3 items-center">
          <label className={btn + ' cursor-pointer'}>📷 Open camera<input type="file" accept="image/*" capture="environment" hidden onChange={pick} /></label>
          <label className="border-2 border-indigo-600 text-indigo-700 rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer">🖼 Choose from gallery<input type="file" accept="image/*" hidden onChange={pick} /></label>
          {prev && <img src={prev} className="h-24 rounded-lg border-2 border-indigo-200" />}
        </div>
      </Section>
      {err && <p className="text-red-600 font-semibold">{err}</p>}
      <button className={btn + ' text-base px-8 py-3'} disabled={busy} onClick={submit}>{busy ? 'Submitting…' : '🚨 Submit breakdown'}</button>
    </div>
  )
}

export function UsersPage() {
  const [list, setList] = useState<any[]>([]); const [v, setV] = useState<any>({ r: 'PRODUCTION' }); const [msg, setMsg] = useState('')
  const reload = async () => { const { data } = await sb.from('profiles').select('*').order('username'); setList(data || []) }
  useEffect(() => { reload() }, [])
  const spec = [{ k: 'u', label: 'Username', req: 1, hint: 'Letters, numbers, dot or underscore. No spaces.' }, { k: 'pw', label: 'Password', req: 1, hint: 'Minimum 6 characters' }, { k: 'nm', label: 'Employee name', req: 1 }, { k: 'code', label: 'Employee code' }, { k: 'dept', label: 'Department' }, { k: 'r', label: 'Role', type: 'select', req: 1, options: ['PRODUCTION', 'MAINTENANCE', 'ADMIN'] }]
  const add = async () => {
    const m = missing(spec, v); if (m.length) return setMsg('Please fill: ' + m.join(', '))
    if (!/^[a-z0-9._-]{3,}$/i.test(v.u)) return setMsg('Username: at least 3 letters/numbers, no spaces')
    if (v.pw.length < 6) return setMsg('Password must be at least 6 characters')
    const { error } = await sb.rpc('create_user', { u: v.u, pw: v.pw, nm: v.nm, code: v.code || '', dept: v.dept || '', r: v.r })
    setMsg(error ? error.message : '✅ User created'); if (!error) setV({ r: 'PRODUCTION' }); reload()
  }
  return (
    <div className="space-y-4">
      <Section title="➕ Create user"><Fields spec={spec} v={v} set={setV} /><div className="mt-3 flex items-center gap-3"><button className={btn} onClick={add}>Create user</button><span className="text-sm font-medium">{msg}</span></div></Section>
      <Section title={`👥 All users (${list.length})`}><div className={TW}><table className="w-full bg-white text-sm"><thead className={TH}><tr>{['Username', 'Name', 'Code', 'Department', 'Role', 'Active', 'Password', 'Delete'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {list.map(u => <tr key={u.id} className="border-t"><td className="p-2 font-semibold">{u.username}</td><td>{u.full_name}</td><td>{u.emp_code}</td><td>{u.department}</td><td><span className={'px-2 py-0.5 rounded-full text-xs font-bold ' + RB[u.role]}>{u.role}</span></td>
          <td><input type="checkbox" checked={u.active} onChange={async e => { await sb.rpc('set_user_active', { uid: u.id, a: e.target.checked }); reload() }} /></td>
          <td><button className="underline text-indigo-700" onClick={async () => { const pw = prompt('New password for ' + u.username); if (pw) { const { error } = await sb.rpc('reset_password', { uid: u.id, pw }); alert(error?.message || 'Password reset') } }}>Reset</button></td>
          <td><button title="Delete user" onClick={async () => { if (!confirm('Delete user ' + u.username + '? Their past actions stay in history by name.')) return; const { error } = await sb.rpc('delete_user', { p_id: u.id }); if (error) alert(error.message); reload() }}>🗑</button></td></tr>)}
      </tbody></table></div></Section>
    </div>
  )
}

export function MachinesPage() {
  const [list, setList] = useState<any[]>([]); const [v, setV] = useState<any>({}); const [msg, setMsg] = useState('')
  const reload = async () => { const { data } = await sb.from('machines').select('*').order('machine_no'); setList(data || []) }
  useEffect(() => { reload() }, [])
  const spec = [{ k: 'machine_no', label: 'Machine number', req: 1 }, { k: 'name', label: 'Machine name', req: 1 }, { k: 'type', label: 'Machine type' }, { k: 'department', label: 'Department' }, { k: 'location', label: 'Location' }, { k: 'operator', label: 'Operator' },
    { k: 'category', label: 'Category' }, { k: 'maint_type', label: 'Maintenance type' }, { k: 'install_year', label: 'Year of installation', type: 'number' }, { k: 'loss_per_hour', label: 'Production loss per hour (₹)', type: 'number' }, { k: 'description', label: 'Machine description', type: 'textarea' }]
  const add = async () => {
    const m = missing(spec, v); if (m.length) return setMsg('Please fill: ' + m.join(', '))
    const { error } = await sb.from('machines').insert({ ...v, loss_per_hour: Number(v.loss_per_hour) || 0, install_year: Number(v.install_year) || null })
    setMsg(error ? error.message : '✅ Machine saved'); if (!error) setV({}); reload()
  }
  return (
    <div className="space-y-4">
      <Section title="➕ Add machine"><Fields spec={spec} v={v} set={setV} /><div className="mt-3 flex items-center gap-3"><button className={btn} onClick={add}>Save machine</button><span className="text-sm font-medium">{msg}</span></div></Section>
      <Section title={`🏭 Machine master (${list.length})`}><div className={TW}><table className="w-full bg-white text-sm"><thead className={TH}><tr>{['No', 'Name', 'Type', 'Department', 'Location', 'Loss/hr', 'Active', 'Delete'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {list.map(m => <tr key={m.id} className="border-t"><td className="p-2 font-semibold">{m.machine_no}</td><td>{m.name}</td><td>{m.type}</td><td>{m.department}</td><td>{m.location}</td><td>₹{m.loss_per_hour}</td>
          <td><input type="checkbox" checked={m.active} onChange={async e => { await sb.from('machines').update({ active: e.target.checked }).eq('id', m.id); reload() }} /></td>
          <td><button title="Delete machine" onClick={async () => { if (!confirm('Delete machine ' + m.machine_no + '?')) return; const { error } = await sb.from('machines').delete().eq('id', m.id); if (error) alert('Cannot delete: it is used in breakdown records. Untick Active instead.'); reload() }}>🗑</button></td></tr>)}
      </tbody></table></div></Section>
    </div>
  )
}

export function FormSettings() {
  const { o, fields, load } = useCfg(); const [nv, setNv] = useState<any>({}); const [f, setF] = useState<any>({ ftype: 'text' })
  const KINDS: [string, string][] = [['shift', '🕒 Shift names'], ['bd_category', '🏷 Breakdown categories'], ['bd_type', '📌 Types of breakdown']]
  const addOpt = async (k: string) => { if (!nv[k]) return; await sb.from('form_options').insert({ kind: k, value: nv[k], sort: 99 }); setNv({ ...nv, [k]: '' }); load() }
  const addField = async () => {
    if (!f.label) return alert('Enter a field label')
    const { error } = await sb.from('form_fields').insert({ label: f.label, ftype: f.ftype, options: f.options || null, required: f.required === 'Yes', sort: 99 })
    if (error) alert(error.message); else setF({ ftype: 'text' }); load()
  }
  return (
    <div className="space-y-4">
      <p className="text-slate-600">Control what Production sees in the <b>Report Breakdown</b> form. Changes apply immediately.</p>
      <div className="grid md:grid-cols-3 gap-4">{KINDS.map(([k, title]) => <Section key={k} title={title}>
        <div className="max-h-48 overflow-auto space-y-1 mb-3">{o[k].map((x: any) => <div key={x.id} className="flex justify-between border-2 border-slate-200 rounded-lg px-3 py-1"><span>{x.value}</span><button onClick={async () => { await sb.from('form_options').delete().eq('id', x.id); load() }}>🗑</button></div>)}</div>
        <div className="flex gap-2"><input className={inp} placeholder="Add new…" value={nv[k] || ''} onChange={e => setNv({ ...nv, [k]: e.target.value })} /><button className={btn} onClick={() => addOpt(k)}>Add</button></div></Section>)}</div>
      <Section title="🧩 Extra input fields on the report form">
        <Fields spec={[{ k: 'label', label: 'Field label', req: 1 }, { k: 'ftype', label: 'Input type', type: 'select', options: ['text', 'number', 'date', 'textarea', 'select'] }, { k: 'required', label: 'Required?', type: 'select', options: ['No', 'Yes'] }, { k: 'options', label: 'Dropdown choices (only for type "select")', hint: 'Separate with commas, e.g. Operator error, Wear, Power failure' }]} v={f} set={setF} />
        <button className={btn + ' mt-3'} onClick={addField}>Add field</button>
        <div className={TW + ' mt-4'}><table className="w-full bg-white text-sm"><thead className={TH}><tr>{['Label', 'Type', 'Required', 'Choices', 'Delete'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
          {fields.map((x: any) => <tr key={x.id} className="border-t"><td className="p-2">{x.label}</td><td>{x.ftype}</td><td>{x.required ? 'Yes' : 'No'}</td><td>{x.options}</td><td><button onClick={async () => { await sb.from('form_fields').delete().eq('id', x.id); load() }}>🗑</button></td></tr>)}</tbody></table></div>
      </Section>
    </div>
  )
}
