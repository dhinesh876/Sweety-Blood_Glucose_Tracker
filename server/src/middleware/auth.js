const jwt = require('jsonwebtoken');
const config = require('../config');
const { HttpError } = require('../utils/errors');

module.exports = function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Please log in to continue.'));
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.user = { id: payload.sub };
    next();
  } catch {
    next(new HttpError(401, 'Your session has expired. Please log in again.'));
  }
};