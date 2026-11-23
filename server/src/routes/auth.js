const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const auth = require('../middleware/auth');
const mailer = require('../services/mailer');
const tokens = require('../services/tokenService');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/errors');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL_MINUTES = 30;
const PASSWORD_MSG = 'Password must be at least 8 characters and include a letter and a number.';

// Compared against when the email is unknown so login timing doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', 10);

const signToken = (userId) =>
  jwt.sign({ sub: userId }, config.jwtSecret, { algorithm: 'HS256', expiresIn: config.accessExpiresIn });

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

// Short-lived access token in the JSON body + long-lived rotating refresh token in an httpOnly cookie.
async function startSession(res, user, status = 200) {
  tokens.setRefreshCookie(res, await tokens.createRefreshToken(user.id));
  res.status(status).json({ token: signToken(user.id), user: publicUser(user) });
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function passwordError(pw) {
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return PASSWORD_MSG;
  if (pw.length > 72) return 'Password must be at most 72 characters.'; // bcrypt ignores bytes after 72
  return null;
}

router.post('/register', asyncHandler(async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  const errors = {};
  if (!name) errors.name = 'Please enter your name.';
  if (!EMAIL_RE.test(email)) errors.email = 'Please enter a valid email address.';
  const pwErr = passwordError(password);
  if (pwErr) errors.password = pwErr;
  if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors)[0], errors);

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await db.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hash]
    );
    await startSession(res, rows[0], 201);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'An account with this email already exists.');
    throw err;
  }
}));

router.post('/login', asyncHandler(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  const match = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !match) throw new HttpError(401, 'Invalid email or password.');
  await startSession(res, user);
}));

// Trade the refresh cookie for a new access token (and a new refresh cookie).
router.post('/refresh', asyncHandler(async (req, res) => {
  try {
    const { userId, newToken } = await tokens.rotateRefreshToken(tokens.readRefreshCookie(req));
    const { rows } = await db.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
    if (!rows[0]) throw new HttpError(401, 'Your session has expired. Please log in again.');
    tokens.setRefreshCookie(res, newToken);
    res.json({ token: signToken(userId), user: publicUser(rows[0]) });
  } catch (err) {
    if (err.status === 401) tokens.clearRefreshCookie(res);
    throw err;
  }
}));

router.post('/logout', asyncHandler(async (req, res) => {
  await tokens.revokeRefreshToken(tokens.readRefreshCookie(req));
  tokens.clearRefreshCookie(res);
  res.status(204).end();
}));

router.get('/me', auth, asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT id, name, email FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) throw new HttpError(401, 'Please log in to continue.');
  res.json({ user: publicUser(rows[0]) });
}));

// Always answers the same way, so it can't be used to discover which emails are registered.
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email]);

  if (rows[0]) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [rows[0].id]);
    await db.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
      [rows[0].id, sha256(token), String(RESET_TTL_MINUTES)]
    );
    await mailer.sendResetLink(email, `${config.clientOrigin}/?reset=${token}`);
  }
  res.json({ message: 'If an account exists for this email, a password reset link has been sent.' });
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const token = String(req.body?.token ?? '');
  const password = String(req.body?.password ?? '');
  const pwErr = passwordError(password);
  if (pwErr) throw new HttpError(400, pwErr); // checked first so a weak password doesn't burn the token

  // Atomically claim the token: single use, and must not be expired.
  const claimed = await db.query(
    `UPDATE password_resets SET used_at = NOW()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
      RETURNING user_id`,
    [sha256(token)]
  );
  if (!claimed.rows[0]) throw new HttpError(400, 'This reset link is invalid or has expired.');

  const hash = await bcrypt.hash(password, 10);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, claimed.rows[0].user_id]);
  await tokens.revokeAllForUser(claimed.rows[0].user_id); // a password change signs out every device
  res.json({ message: 'Password updated. Please log in.' });
}));

module.exports = router;