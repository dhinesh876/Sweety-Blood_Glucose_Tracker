const express = require('express');
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/errors');
const { isValidDateString, isFuture, todayString } = require('../utils/dates');
const { buildReport } = require('../services/reportService');
const { MESSAGES } = require('../constants');

const router = express.Router();

// GET /api/reports?date=YYYY-MM-DD  (defaults to today)
router.get('/', auth, asyncHandler(async (req, res) => {
  const date = req.query.date || todayString();
  if (!isValidDateString(date)) throw new HttpError(400, MESSAGES.dateInvalid);
  if (isFuture(date)) throw new HttpError(400, MESSAGES.dateFuture);
  res.json(await buildReport(req.user.id, date));
}));

module.exports = router;
