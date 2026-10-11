const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const { ZodError } = require('zod');
const { HttpError } = require('./errors');

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind a hosting proxy (HTTPS terminated upstream)
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/tasks', require('./routes/tasks'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint not found')));

  // Serve the built React app from the same origin in production.
  const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`),
      });
    }
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
