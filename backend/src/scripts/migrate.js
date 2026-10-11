const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { buildOptions } = require('../db');

(async () => {
  const conn = await mysql.createConnection(buildOptions({ multipleStatements: true }));
  try {
    await conn.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(200) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    const dir = path.join(__dirname, '..', '..', 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const [done] = await conn.query('SELECT 1 FROM schema_migrations WHERE name = ?', [file]);
      if (done.length) { console.log(`skip    ${file}`); continue; }
      await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      console.log(`applied ${file}`);
    }
  } finally {
    await conn.end();
  }
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
