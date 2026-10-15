const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'tts_token';
const SECRET = process.env.JWT_SECRET || 'tts-local-dev-secret-2025-do-not-use-in-prod';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function getTokenFromRequest(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  return parseCookies(cookieHeader)[COOKIE_NAME] || null;
}

module.exports = { COOKIE_NAME, SECRET, signToken, verifyToken, parseCookies, getTokenFromRequest };
