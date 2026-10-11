const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { authenticate, requireRole } = require('../auth');
const { HttpError, wrap } = require('../errors');
const { userBody } = require('../validate');

router.use(authenticate, requireRole('ADMIN'));

router.get('/', wrap(async (_req, res) => {
  const [rows] = await pool.execute('SELECT id, name, email, role, created_at FROM users ORDER BY role, name');
  res.json({ users: rows });
}));

router.post('/', wrap(async (req, res) => {
  const { name, email, password, role } = userBody.parse(req.body);
  const hash = await bcrypt.hash(password, 10);
  try {
    const [r] = await pool.execute(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role]
    );
    res.status(201).json({ user: { id: r.insertId, name, email, role } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'A user with this email already exists');
    throw err;
  }
}));

module.exports = router;
