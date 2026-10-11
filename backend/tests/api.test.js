/**
 * Integration tests: need MySQL with migrations + seed applied (see README).
 * Uses the seeded demo accounts; every task created here is deleted afterwards.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');

const app = createApp();
const EMP_PW = process.env.SEED_EMPLOYEE_PASSWORD || 'Employee@12345';
const ADMIN_PW = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
const created = [];
let admin, emp1, emp2;

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const nextWeek = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

async function createTask(assignee, title = 'Test task') {
  const res = await request(app).post('/api/tasks').set(as(admin))
    .send({ title, description: 'd', priority: 'HIGH', due_date: nextWeek, assigned_to: assignee.id });
  expect(res.status).toBe(201);
  created.push(res.body.task.id);
  return res.body.task;
}
const act = (user, id, action, note) =>
  request(app).post(`/api/tasks/${id}/transition`).set(as(user)).send({ action, note });

beforeAll(async () => {
  admin = await login('admin@demo.com', ADMIN_PW);
  emp1 = await login('employee1@demo.com', EMP_PW);
  emp2 = await login('employee2@demo.com', EMP_PW);
});

afterAll(async () => {
  for (const id of created) await pool.execute('DELETE FROM tasks WHERE id = ?', [id]);
  await pool.end();
});

describe('authentication', () => {
  test('rejects bad password and unauthenticated access', async () => {
    const bad = await request(app).post('/api/auth/login').send({ email: 'admin@demo.com', password: 'wrong' });
    expect(bad.status).toBe(401);
    expect((await request(app).get('/api/tasks')).status).toBe(401);
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
  });
});

describe('authorization', () => {
  test('employee cannot create, edit or delete tasks, or list users', async () => {
    const payload = { title: 'x', due_date: nextWeek, assigned_to: emp1.id };
    expect((await request(app).post('/api/tasks').set(as(emp1)).send(payload)).status).toBe(403);
    const t = await createTask(emp1);
    expect((await request(app).put(`/api/tasks/${t.id}`).set(as(emp1)).send({ ...payload, title: 'hack' })).status).toBe(403);
    expect((await request(app).delete(`/api/tasks/${t.id}`).set(as(emp1))).status).toBe(403);
    expect((await request(app).get('/api/users').set(as(emp1))).status).toBe(403);
  });

  test('employee only sees and opens their own tasks', async () => {
    const mine = await createTask(emp1, 'mine');
    const theirs = await createTask(emp2, 'theirs');
    const list = await request(app).get('/api/tasks').set(as(emp1));
    const ids = list.body.tasks.map((t) => t.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
    // even forcing the admin-only filter must not widen scope
    const forced = await request(app).get(`/api/tasks?assignedTo=${emp2.id}`).set(as(emp1));
    expect(forced.body.tasks.every((t) => t.assigned_to === emp1.id)).toBe(true);
    expect((await request(app).get(`/api/tasks/${theirs.id}`).set(as(emp1))).status).toBe(403);
    expect((await request(app).post(`/api/tasks/${theirs.id}/comments`).set(as(emp1)).send({ body: 'hi' })).status).toBe(403);
  });
});

describe('approval workflow', () => {
  test('full happy path with persistence and history', async () => {
    const t = await createTask(emp1, 'Workflow task');
    expect((await act(emp1, t.id, 'start')).body.task.status).toBe('IN_PROGRESS');
    expect((await request(app).post(`/api/tasks/${t.id}/comments`).set(as(emp1)).send({ body: 'working on it' })).status).toBe(201);
    expect((await act(emp1, t.id, 'submit')).body.task.status).toBe('PENDING_APPROVAL');
    expect((await act(admin, t.id, 'approve')).body.task.status).toBe('COMPLETED');

    const detail = await request(app).get(`/api/tasks/${t.id}`).set(as(admin));
    expect(detail.body.task.status).toBe('COMPLETED');
    expect(detail.body.comments).toHaveLength(1);
    expect(detail.body.history.map((h) => h.to_status)).toEqual(['PENDING', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED']);
  });

  test('employee cannot approve, other employee cannot act, admin can reject', async () => {
    const t = await createTask(emp1, 'Reject task');
    await act(emp1, t.id, 'start');
    await act(emp1, t.id, 'submit');
    expect((await act(emp1, t.id, 'approve')).status).toBe(403);
    expect((await act(emp2, t.id, 'reject')).status).toBe(403);
    const rejected = await act(admin, t.id, 'reject', 'Needs more detail');
    expect(rejected.body.task.status).toBe('IN_PROGRESS');
  });

  test('invalid transitions are refused', async () => {
    const t = await createTask(emp1, 'Order task');
    expect((await act(emp1, t.id, 'submit')).status).toBe(409); // PENDING -> submit not allowed
    expect((await act(admin, t.id, 'approve')).status).toBe(409);
  });
});

describe('dashboard, filters and validation', () => {
  test('dashboard counts are scoped to the user', async () => {
    await createTask(emp1, 'dash');
    const a = await request(app).get('/api/dashboard').set(as(admin));
    const e = await request(app).get('/api/dashboard').set(as(emp1));
    const [[mine]] = await pool.query('SELECT COUNT(*) AS n FROM tasks WHERE assigned_to = ?', [emp1.id]);
    const [[all]] = await pool.query('SELECT COUNT(*) AS n FROM tasks');
    expect(e.body.total).toBe(Number(mine.n));
    expect(a.body.total).toBe(Number(all.n));
    expect(Object.keys(a.body.counts).sort()).toEqual(['COMPLETED', 'IN_PROGRESS', 'PENDING', 'PENDING_APPROVAL']);
  });

  test('admin can filter by status, priority and employee', async () => {
    const t = await createTask(emp2, 'filter me');
    const res = await request(app).get(`/api/tasks?status=PENDING&priority=HIGH&assignedTo=${emp2.id}`).set(as(admin));
    expect(res.status).toBe(200);
    expect(res.body.tasks.some((x) => x.id === t.id)).toBe(true);
    expect(res.body.tasks.every((x) => x.status === 'PENDING' && x.priority === 'HIGH' && x.assigned_to === emp2.id)).toBe(true);
    expect((await request(app).get('/api/tasks?status=BOGUS').set(as(admin))).status).toBe(400);
  });

  test('invalid input is rejected with clear errors', async () => {
    const res = await request(app).post('/api/tasks').set(as(admin)).send({ title: '', due_date: 'not-a-date', assigned_to: emp1.id });
    expect(res.status).toBe(400);
    expect(res.body.details.length).toBeGreaterThan(0);
    const toAdmin = await request(app).post('/api/tasks').set(as(admin)).send({ title: 'x', due_date: nextWeek, assigned_to: admin.id });
    expect(toAdmin.status).toBe(400);
  });
});
