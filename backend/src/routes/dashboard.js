const router = require('express').Router();
const { pool } = require('../db');
const { authenticate } = require('../auth');
const { wrap } = require('../errors');
const { STATUSES } = require('../workflow');

router.get('/', authenticate, wrap(async (req, res) => {
  const scoped = req.user.role !== 'ADMIN';
  const [rows] = await pool.execute(
    `SELECT status, COUNT(*) AS count FROM tasks ${scoped ? 'WHERE assigned_to = ?' : ''} GROUP BY status`,
    scoped ? [req.user.id] : []
  );
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  rows.forEach((r) => { counts[r.status] = Number(r.count); });
  res.json({ counts, total: Object.values(counts).reduce((a, b) => a + b, 0), scope: scoped ? 'mine' : 'all' });
}));

module.exports = router;
