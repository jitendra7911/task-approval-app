const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { signToken, authenticate } = require('../auth');
const { HttpError, wrap } = require('../errors');
const { loginBody } = require('../validate');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many login attempts, please try again later' },
});

// Pre-computed hash so unknown emails take the same time as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

router.post('/login', limiter, wrap(async (req, res) => {
  const { email, password } = loginBody.parse(req.body);
  const [rows] = await pool.execute('SELECT id, name, email, role, password_hash FROM users WHERE email = ?', [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password');
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

module.exports = router;
