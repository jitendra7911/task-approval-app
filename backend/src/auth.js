const jwt = require('jsonwebtoken');
const config = require('./config');
const { pool } = require('./db');
const { HttpError, wrap } = require('./errors');

const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, config.getJwtSecret(), { expiresIn: config.jwtExpiresIn });

// Verifies the bearer token and re-loads the user so deleted users / role changes take effect.
const authenticate = wrap(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Authentication required');
  let payload;
  try {
    payload = jwt.verify(token, config.getJwtSecret());
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  const [rows] = await pool.execute('SELECT id, name, email, role FROM users WHERE id = ?', [payload.sub]);
  if (!rows[0]) throw new HttpError(401, 'User no longer exists');
  req.user = rows[0];
  next();
});

const requireRole = (role) => (req, _res, next) =>
  req.user.role === role ? next() : next(new HttpError(403, `${role.toLowerCase()} access required`));

module.exports = { signToken, authenticate, requireRole };
