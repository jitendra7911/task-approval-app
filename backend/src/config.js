const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  port: Number(process.env.PORT) || 4000,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  getJwtSecret() {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
    return process.env.JWT_SECRET;
  },
};
