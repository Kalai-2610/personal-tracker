const argon2 = require('argon2');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET?.trim() || 'your_jwt_secret';

/**
 * Hashes a password using Argon2i, returns salt and hash separately
 * @param {string} password - The password to hash
 * @returns {Promise<{salt: string, hash: string}>}
 */
async function hashPasswordArgon2i(password) {
  // Generate a random salt
  const saltRaw = crypto.randomBytes(16);
  // Hash the password with Argon2i
  const fullHash = await argon2.hash(password, {
    type: argon2.argon2i,
    salt: saltRaw,
    hashLength: 32,
    timeCost: 3,
    memoryCost: 4096,
    parallelism: 1,
  });
  // Split the hash: salt = everything except the last 32 chars, hash = last 32 chars
  const saltindex = fullHash.lastIndexOf('$') + 1; // Find the last '$' to split salt and hash
  const salt = fullHash.slice(0, saltindex);
  const hash = fullHash.slice(saltindex)
  return { salt, hash };
}

/**
 * Verifies a password against a given Argon2i hash (split salt/hash)
 * @param {string} password - The password to verify
 * @param {string} salt - The salt/prefix part of the hash
 * @param {string} hash - The last part of the hash
 * @returns {Promise<boolean>}
 */
async function verifyPasswordArgon2i(password, salt, hash) {
  const fullHash = salt + hash;
  return await argon2.verify(fullHash, password);
}


/**
 * Generate a JWT token
 * @param {object} payload - Data to encode in the token
 * @param {string|number} [expiresIn] - Expiry time (e.g. '1h', '7d')
 * @returns {string} JWT token
 */
function generateJWT(payload, expiresIn = '1h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * Verify a JWT token
 * @param {string} token - JWT token to verify
 * @returns {object} {is_invalid: boolean, is_token_expired: boolean}
 */
function verifyJWT(token) {
  try {
    jwt.verify(token, JWT_SECRET);
    return { is_invalid: false, is_token_expired: false };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { is_invalid: false, is_token_expired: true };
    }
    return { is_invalid: true, is_token_expired: false };
  }
}

/**
 * Get payload from JWT token (without verifying signature)
 * @param {string} token - JWT token
 * @returns {object|null} Decoded payload or null if invalid
 */
function getJWTPayload(token) {
  try {
    return jwt.decode(token);
  } catch (err) {
    return err;
  }
}

function generateUUIDv4() {
  return crypto.randomUUID();
}

module.exports = {
  hashPasswordArgon2i,
  verifyPasswordArgon2i,
  generateJWT,
  verifyJWT,
  getJWTPayload,
  generateUUIDv4
};
