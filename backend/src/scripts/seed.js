const bcrypt = require('bcryptjs');
const { pool } = require('../db');

const adminPw = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
const empPw = process.env.SEED_EMPLOYEE_PASSWORD || 'Employee@12345';

const USERS = [
  { name: 'Demo Admin', email: 'admin@demo.com', role: 'ADMIN', pw: adminPw },
  { name: 'Asha Employee', email: 'employee1@demo.com', role: 'EMPLOYEE', pw: empPw },
  { name: 'Ravi Employee', email: 'employee2@demo.com', role: 'EMPLOYEE', pw: empPw },
];

(async () => {
  const ids = {};
  for (const u of USERS) {
    const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [u.email]);
    if (rows[0]) { ids[u.email] = rows[0].id; continue; }
    const [r] = await pool.execute(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [u.name, u.email, await bcrypt.hash(u.pw, 10), u.role]
    );
    ids[u.email] = r.insertId;
  }

  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM tasks');
  if (n === 0) {
    const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
    const samples = [
      ['Prepare monthly sales report', 'Compile sales numbers for the month.', 'HIGH', 'PENDING', 3, 'employee1@demo.com'],
      ['Update onboarding checklist', 'Add the new laptop-setup steps.', 'MEDIUM', 'IN_PROGRESS', 5, 'employee1@demo.com'],
      ['Review vendor contract', 'Check renewal terms and flag issues.', 'HIGH', 'PENDING_APPROVAL', 1, 'employee2@demo.com'],
      ['Archive old support tickets', 'Close tickets older than 90 days.', 'LOW', 'COMPLETED', -2, 'employee2@demo.com'],
    ];
    for (const [title, desc, pr, st, d, who] of samples) {
      const [r] = await pool.execute(
        'INSERT INTO tasks (title, description, priority, status, due_date, assigned_to, created_by) VALUES (?,?,?,?,?,?,?)',
        [title, desc, pr, st, day(d), ids[who], ids['admin@demo.com']]
      );
      await pool.execute(
        'INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, note) VALUES (?, NULL, ?, ?, ?)',
        [r.insertId, st, ids['admin@demo.com'], 'Seeded demo task']
      );
    }
  }
  console.log('Seed complete: admin@demo.com, employee1@demo.com, employee2@demo.com');
  await pool.end();
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
