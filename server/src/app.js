const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');

const app = express();

app.use(helmet()); // secure headers, hides X-Powered-By
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '10kb' }));

// Brute-force protection on the credential endpoints (skipped in tests).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in a few minutes.' },
  skip: () => process.env.NODE_ENV === 'test',
});
app.use(
  ['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password'],
  authLimiter
);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/readings', require('./routes/readings'));
app.use('/api/reports', require('./routes/reports'));

app.use((req, res) => res.status(404).json({ message: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request body too large.' });
  if (err.status) return res.status(err.status).json({ message: err.message, errors: err.errors });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

module.exports = app;