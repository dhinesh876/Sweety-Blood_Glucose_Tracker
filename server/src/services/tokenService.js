const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { HttpError } = require('../utils/errors');

const COOKIE_NAME = 'sweety_refresh';
const GRACE_SECONDS = 10; // a just-rotated token (e.g. two tabs refreshing at once) is not treated as theft

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sessionExpired = () => new HttpError(401, 'Your session has expired. Please log in again.');

// httpOnly: JavaScript can't read it. Path-limited: the browser only sends it to /api/auth/*.
const cookieOptions = () => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
});

function setRefreshCookie(res, token) {
    res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: config.refreshDays * 86400000 });
}

function clearRefreshCookie(res) {
    res.clearCookie(COOKIE_NAME, cookieOptions());
}

function readRefreshCookie(req) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name === COOKIE_NAME) return decodeURIComponent(rest.join('='));
    }
    return null;
}

async function createRefreshToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.query(
        `DELETE FROM refresh_tokens
      WHERE user_id = $1 AND (expires_at < NOW() OR revoked_at < NOW() - interval '1 day')`,
        [userId]
    );
    await db.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' days')::interval)`,
        [userId, sha256(token), String(config.refreshDays)]
    );
    return token;
}

async function revokeAllForUser(userId) {
    await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

async function revokeRefreshToken(rawToken) {
    if (!rawToken) return;
    await db.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
        [sha256(rawToken)]
    );
}

/**
 * Rotation: each refresh token works once. Presenting it returns a new one and revokes the old.
 * Presenting an already-used token long after rotation means it leaked, so every session of that user is revoked.
 */
async function rotateRefreshToken(rawToken) {
    if (!rawToken) throw sessionExpired();

    const { rows } = await db.query(
        `SELECT id, user_id,
            revoked_at IS NOT NULL AS revoked,
            revoked_at < NOW() - ($2 || ' seconds')::interval AS long_revoked,
            expires_at < NOW() AS expired
       FROM refresh_tokens WHERE token_hash = $1`,
        [sha256(rawToken), String(GRACE_SECONDS)]
    );
    const row = rows[0];
    if (!row) throw sessionExpired();

    if (row.revoked) {
        if (row.long_revoked) await revokeAllForUser(row.user_id);
        throw sessionExpired();
    }
    if (row.expired) throw sessionExpired();

    // Claim it atomically so two simultaneous requests can't both rotate the same token.
    const claimed = await db.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL RETURNING id',
        [row.id]
    );
    if (!claimed.rowCount) throw sessionExpired();

    return { userId: row.user_id, newToken: await createRefreshToken(row.user_id) };
}

module.exports = {
    COOKIE_NAME,
    setRefreshCookie,
    clearRefreshCookie,
    readRefreshCookie,
    createRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
    revokeAllForUser,
};