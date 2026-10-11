import React, { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken, STATUS_LABEL, STATUSES, PRIORITIES } from './api.js';

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div className="error" role="alert">
      {error.message || String(error)}
      {error.details?.length > 0 && <ul>{error.details.map((d) => <li key={d}>{d}</li>)}</ul>}
    </div>
  );
}
const Badge = ({ status }) => <span className={`badge s-${status}`}>{STATUS_LABEL[status]}</span>;
const Prio = ({ p }) => <span className={`prio p-${p}`}>{p}</span>;

/* ---------------- Login ---------------- */
function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(data.token);
      onLogin(data.user);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const fill = (e, p) => { setEmail(e); setPassword(p); };

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>Task &amp; Approval Manager</h1>
        <ErrorBox error={error} />
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="demo">
          <p>Demo accounts (click to fill):</p>
          <button type="button" onClick={() => fill('admin@demo.com', 'Admin@12345')}>Admin</button>
          <button type="button" onClick={() => fill('employee1@demo.com', 'Employee@12345')}>Employee 1</button>
          <button type="button" onClick={() => fill('employee2@demo.com', 'Employee@12345')}>Employee 2</button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ user, openTasks }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api('/dashboard').then(setData).catch(setError); }, []);
  return (
    <section>
      <h2>Dashboard <small>{user.role === 'ADMIN' ? 'All tasks' : 'My tasks'}</small></h2>
      <ErrorBox error={error} />
      {!data && !error && <p className="muted">Loading…</p>}
      {data && (
        <div className="stats">
          {STATUSES.map((s) => (
            <button key={s} className={`stat s-${s}`} onClick={() => openTasks(s)}>
              <span className="num">{data.counts[s]}</span>
              <span>{STATUS_LABEL[s]}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- Task form (admin) ---------------- */
function TaskForm({ task, employees, onClose, onSaved }) {
  const [f, setF] = useState({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'MEDIUM',
    due_date: task?.due_date || today(),
    assigned_to: task?.assigned_to || employees[0]?.id || '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const body = { ...f, assigned_to: Number(f.assigned_to) };
      await api(task ? `/tasks/${task.id}` : '/tasks', { method: task ? 'PUT' : 'POST', body });
      onSaved();
    } catch (err) { setError(err); setBusy(false); }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{task ? 'Edit task' : 'New task'}</h3>
        <ErrorBox error={error} />
        <label>Title<input value={f.title} onChange={set('title')} maxLength={200} required /></label>
        <label>Description<textarea rows={4} value={f.description} onChange={set('description')} /></label>
        <div className="row">
          <label>Priority
            <select value={f.priority} onChange={set('priority')}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
          </label>
          <label>Due date<input type="date" value={f.due_date} onChange={set('due_date')} required /></label>
        </div>
        <label>Assign to
          <select value={f.assigned_to} onChange={set('assigned_to')} required>
            {employees.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </label>
        <div className="actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- Task detail ---------------- */
function TaskDetail({ id, user, onClose, onChanged, onEdit }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/tasks/${id}`).then(setD).catch(setError), [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setBusy(true); setError(null);
    try { await fn(); await load(); onChanged(); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const transition = (action) => run(async () => {
    await api(`/tasks/${id}/transition`, { method: 'POST', body: { action, note: note || undefined } });
    setNote('');
  });
  const addComment = (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    run(async () => { await api(`/tasks/${id}/comments`, { method: 'POST', body: { body: comment } }); setComment(''); });
  };
  const remove = async () => {
    if (!window.confirm('Delete this task permanently?')) return;
    try { await api(`/tasks/${id}`, { method: 'DELETE' }); onChanged(); onClose(); } catch (err) { setError(err); }
  };

  const t = d?.task;
  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide card" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <ErrorBox error={error} />
        {!t && !error && <p className="muted">Loading…</p>}
        {t && (
          <>
            <h3>{t.title} <Badge status={t.status} /></h3>
            <p className="meta">
              <Prio p={t.priority} /> · Due {t.due_date} · Assigned to {t.assignee_name}
            </p>
            <p className="desc">{t.description || <em className="muted">No description</em>}</p>

            <div className="actions left">
              {!isAdmin && t.status === 'PENDING' && <button className="primary" disabled={busy} onClick={() => transition('start')}>Start work</button>}
              {!isAdmin && t.status === 'IN_PROGRESS' && <button className="primary" disabled={busy} onClick={() => transition('submit')}>Submit for approval</button>}
              {isAdmin && t.status === 'PENDING_APPROVAL' && (
                <>
                  <input placeholder="Optional note (e.g. rejection reason)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button className="ok" disabled={busy} onClick={() => transition('approve')}>Approve</button>
                  <button className="danger" disabled={busy} onClick={() => transition('reject')}>Reject</button>
                </>
              )}
              {isAdmin && <button onClick={() => onEdit(t)}>Edit</button>}
              {isAdmin && <button className="danger-outline" onClick={remove}>Delete</button>}
            </div>

            <h4>Comments</h4>
            <ul className="list">
              {d.comments.length === 0 && <li className="muted">No comments yet</li>}
              {d.comments.map((c) => (
                <li key={c.id}><b>{c.author_name}</b> <small>({c.author_role.toLowerCase()}) {fmt(c.created_at)}</small><br />{c.body}</li>
              ))}
            </ul>
            <form className="inline" onSubmit={addComment}>
              <input placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
              <button disabled={busy || !comment.trim()}>Post</button>
            </form>

            <h4>Status history</h4>
            <ul className="list">
              {d.history.map((h) => (
                <li key={h.id}>
                  {h.from_status ? `${STATUS_LABEL[h.from_status]} → ` : ''}<b>{STATUS_LABEL[h.to_status]}</b>
                  <small> by {h.changed_by_name} · {fmt(h.created_at)}</small>
                  {h.note && <div className="muted">“{h.note}”</div>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Tasks list ---------------- */
function Tasks({ user, initialStatus }) {
  const isAdmin = user.role === 'ADMIN';
  const [filters, setFilters] = useState({ status: initialStatus || '', priority: '', assignedTo: '' });
  const [tasks, setTasks] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null); // null | {} (new) | task (edit)

  const load = useCallback(() => {
    const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    api(`/tasks${q ? `?${q}` : ''}`).then((r) => { setTasks(r.tasks); setError(null); }).catch(setError);
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (isAdmin) api('/users').then((r) => setEmployees(r.users.filter((u) => u.role === 'EMPLOYEE'))).catch(setError);
  }, [isAdmin]);

  const setF = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <section>
      <div className="head">
        <h2>{isAdmin ? 'All tasks' : 'My tasks'}</h2>
        {isAdmin && <button className="primary" onClick={() => setForm({})} disabled={!employees.length}>+ New task</button>}
      </div>
      <div className="filters">
        <select value={filters.status} onChange={setF('status')} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select value={filters.priority} onChange={setF('priority')} aria-label="Filter by priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
        {isAdmin && (
          <select value={filters.assignedTo} onChange={setF('assignedTo')} aria-label="Filter by employee">
            <option value="">All employees</option>
            {employees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <button onClick={() => setFilters({ status: '', priority: '', assignedTo: '' })}>Clear</button>
      </div>
      <ErrorBox error={error} />
      {!tasks && !error && <p className="muted">Loading…</p>}
      {tasks && tasks.length === 0 && <p className="muted empty">No tasks match.</p>}
      {tasks && tasks.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Title</th><th>Status</th><th>Priority</th><th>Due</th>{isAdmin && <th>Assignee</th>}</tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} onClick={() => setOpenId(t.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpenId(t.id)}>
                  <td>{t.title}</td>
                  <td><Badge status={t.status} /></td>
                  <td><Prio p={t.priority} /></td>
                  <td className={t.status !== 'COMPLETED' && t.due_date < today() ? 'overdue' : ''}>{t.due_date}</td>
                  {isAdmin && <td>{t.assignee_name}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openId && (
        <TaskDetail id={openId} user={user} onClose={() => setOpenId(null)} onChanged={load}
          onEdit={(t) => { setOpenId(null); setForm(t); }} />
      )}
      {form && (
        <TaskForm task={form.id ? form : null} employees={employees} onClose={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }} />
      )}
    </section>
  );
}

/* ---------------- Users (admin) ---------------- */
function Users() {
  const [users, setUsers] = useState([]);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'EMPLOYEE' });
  const [error, setError] = useState(null);
  const [ok, setOk] = useState('');
  const load = () => api('/users').then((r) => setUsers(r.users)).catch(setError);
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setError(null); setOk('');
    try {
      await api('/users', { method: 'POST', body: f });
      setOk(`User ${f.email} created`);
      setF({ name: '', email: '', password: '', role: 'EMPLOYEE' });
      load();
    } catch (err) { setError(err); }
  };

  return (
    <section>
      <h2>Users</h2>
      <form className="card inline-form" onSubmit={submit}>
        <input placeholder="Name" value={f.name} onChange={set('name')} required />
        <input type="email" placeholder="Email" value={f.email} onChange={set('email')} required />
        <input type="password" placeholder="Password (min 8)" value={f.password} onChange={set('password')} required minLength={8} />
        <select value={f.role} onChange={set('role')}><option value="EMPLOYEE">Employee</option><option value="ADMIN">Admin</option></select>
        <button className="primary">Create user</button>
      </form>
      <ErrorBox error={error} />
      {ok && <div className="success">{ok}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>{users.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- App shell ---------------- */
export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  const [view, setView] = useState({ name: 'dashboard' });

  useEffect(() => {
    if (getToken()) api('/auth/me').then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setReady(true));
    const expired = () => setUser(null);
    window.addEventListener('auth-expired', expired);
    return () => window.removeEventListener('auth-expired', expired);
  }, []);

  const logout = () => { setToken(null); setUser(null); setView({ name: 'dashboard' }); };

  if (!ready) return <p className="muted center">Loading…</p>;
  if (!user) return <Login onLogin={setUser} />;

  const nav = (name, label) => (
    <button className={view.name === name ? 'active' : ''} onClick={() => setView({ name })}>{label}</button>
  );

  return (
    <>
      <header>
        <strong>Task &amp; Approval Manager</strong>
        <nav>
          {nav('dashboard', 'Dashboard')}
          {nav('tasks', user.role === 'ADMIN' ? 'All tasks' : 'My tasks')}
          {user.role === 'ADMIN' && nav('users', 'Users')}
        </nav>
        <span className="who">{user.name} <small>({user.role.toLowerCase()})</small></span>
        <button onClick={logout}>Log out</button>
      </header>
      <main>
        {view.name === 'dashboard' && <Dashboard user={user} openTasks={(status) => setView({ name: 'tasks', status })} />}
        {view.name === 'tasks' && <Tasks key={view.status || 'all'} user={user} initialStatus={view.status} />}
        {view.name === 'users' && <Users />}
      </main>
    </>
  );
}
