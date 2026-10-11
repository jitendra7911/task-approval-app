const router = require('express').Router();
const { pool, withTx } = require('../db');
const { authenticate, requireRole } = require('../auth');
const { HttpError, wrap } = require('../errors');
const { checkTransition } = require('../workflow');
const { taskBody, taskFilters, transitionBody, commentBody } = require('../validate');

router.use(authenticate);

const SELECT = `SELECT t.id, t.title, t.description, t.priority, t.status, t.due_date, t.assigned_to,
  t.created_by, t.created_at, t.updated_at, a.name AS assignee_name, a.email AS assignee_email
  FROM tasks t LEFT JOIN users a ON a.id = t.assigned_to`;

const taskId = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid task id');
  return id;
};

// Loads a task and enforces ownership: employees may only touch tasks assigned to them.
async function loadAccessible(req) {
  const [rows] = await pool.execute(`${SELECT} WHERE t.id = ?`, [taskId(req)]);
  const task = rows[0];
  if (!task) throw new HttpError(404, 'Task not found');
  if (req.user.role !== 'ADMIN' && task.assigned_to !== req.user.id) {
    throw new HttpError(403, 'You do not have access to this task');
  }
  return task;
}

async function assertEmployee(userId) {
  const [rows] = await pool.execute("SELECT id FROM users WHERE id = ? AND role = 'EMPLOYEE'", [userId]);
  if (!rows[0]) throw new HttpError(400, 'assigned_to must be an existing employee');
}

router.get('/', wrap(async (req, res) => {
  const f = taskFilters.parse(req.query);
  const where = [];
  const params = [];
  if (req.user.role !== 'ADMIN') {
    where.push('t.assigned_to = ?'); params.push(req.user.id); // forced scope for employees
  } else if (f.assignedTo) {
    where.push('t.assigned_to = ?'); params.push(f.assignedTo);
  }
  if (f.status) { where.push('t.status = ?'); params.push(f.status); }
  if (f.priority) { where.push('t.priority = ?'); params.push(f.priority); }
  const [rows] = await pool.execute(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.created_at DESC, t.id DESC`,
    params
  );
  res.json({ tasks: rows });
}));

router.post('/', requireRole('ADMIN'), wrap(async (req, res) => {
  const b = taskBody.parse(req.body);
  await assertEmployee(b.assigned_to);
  const id = await withTx(async (c) => {
    const [r] = await c.execute(
      'INSERT INTO tasks (title, description, priority, due_date, assigned_to, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [b.title, b.description, b.priority, b.due_date, b.assigned_to, req.user.id]
    );
    await c.execute(
      'INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, note) VALUES (?, NULL, ?, ?, ?)',
      [r.insertId, 'PENDING', req.user.id, 'Task created']
    );
    return r.insertId;
  });
  const [rows] = await pool.execute(`${SELECT} WHERE t.id = ?`, [id]);
  res.status(201).json({ task: rows[0] });
}));

router.get('/:id', wrap(async (req, res) => {
  const task = await loadAccessible(req);
  const [comments] = await pool.execute(
    `SELECT c.id, c.body, c.created_at, u.name AS author_name, u.role AS author_role
     FROM task_comments c JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.id`, [task.id]);
  const [history] = await pool.execute(
    `SELECT h.id, h.from_status, h.to_status, h.note, h.created_at, u.name AS changed_by_name
     FROM task_status_history h JOIN users u ON u.id = h.changed_by WHERE h.task_id = ? ORDER BY h.id`, [task.id]);
  res.json({ task, comments, history });
}));

router.put('/:id', requireRole('ADMIN'), wrap(async (req, res) => {
  const task = await loadAccessible(req);
  const b = taskBody.parse(req.body);
  await assertEmployee(b.assigned_to);
  await pool.execute(
    'UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?, assigned_to = ? WHERE id = ?',
    [b.title, b.description, b.priority, b.due_date, b.assigned_to, task.id]
  );
  const [rows] = await pool.execute(`${SELECT} WHERE t.id = ?`, [task.id]);
  res.json({ task: rows[0] });
}));

router.delete('/:id', requireRole('ADMIN'), wrap(async (req, res) => {
  const task = await loadAccessible(req);
  await pool.execute('DELETE FROM tasks WHERE id = ?', [task.id]); // comments/history cascade
  res.status(204).end();
}));

router.post('/:id/comments', wrap(async (req, res) => {
  const task = await loadAccessible(req);
  const { body } = commentBody.parse(req.body);
  const [r] = await pool.execute('INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, ?)', [task.id, req.user.id, body]);
  res.status(201).json({ comment: { id: r.insertId, body, author_name: req.user.name, author_role: req.user.role } });
}));

router.post('/:id/transition', wrap(async (req, res) => {
  const { action, note } = transitionBody.parse(req.body);
  const task = await loadAccessible(req);
  const to = checkTransition(action, req.user, task);
  await withTx(async (c) => {
    // Compare-and-set on the old status guards against two people changing it at once.
    const [r] = await c.execute('UPDATE tasks SET status = ? WHERE id = ? AND status = ?', [to, task.id, task.status]);
    if (!r.affectedRows) throw new HttpError(409, 'Task status changed by someone else; please refresh');
    await c.execute(
      'INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, note) VALUES (?, ?, ?, ?, ?)',
      [task.id, task.status, to, req.user.id, note || null]
    );
  });
  const [rows] = await pool.execute(`${SELECT} WHERE t.id = ?`, [task.id]);
  res.json({ task: rows[0] });
}));

module.exports = router;
