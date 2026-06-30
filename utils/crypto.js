/**
 * Crypto Utilities for STF
 * - AES-256-CBC encryption/decryption for reversible PII fields (phone, name, city, etc.)
 * - SHA-256 deterministic hashing for phone lookups
 */
const crypto = require('crypto');

// Encryption key: must be 32 bytes for AES-256. 
// In production, set ENCRYPTION_KEY in .env (a 64-char hex string).
// Falls back to a deterministic key derived from a passphrase.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
    ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
    : crypto.createHash('sha256').update('stf-default-encryption-key-change-in-production').digest();

const IV_LENGTH = 16; // AES block size

/**
 * Encrypt a plaintext string using AES-256-CBC.
 * Returns "iv:encrypted" hex string.
 */
function encrypt(text) {
    if (!text || typeof text !== 'string') return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt an "iv:encrypted" hex string back to plaintext.
 */
function decrypt(encryptedText) {
    if (!encryptedText || typeof encryptedText !== 'string') return encryptedText;
    // If it doesn't look like our encrypted format, return as-is (plain text from old data)
    if (!encryptedText.includes(':')) return encryptedText;
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 2 || parts[0].length !== 32) return encryptedText; // Not encrypted
        const iv = Buffer.from(parts[0], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(parts[1], 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        // If decryption fails, return original (probably not encrypted / old data)
        return encryptedText;
    }
}

/**
 * Create a deterministic SHA-256 hash of a string.
 * Used for phone number lookups — always produces the same hash for the same input.
 */
function deterministicHash(text) {
    if (!text || typeof text !== 'string') return '';
    // Normalize: strip non-digits, keep last 10 digits (Indian phone)
    const cleaned = text.replace(/\D/g, '').slice(-10);
    return crypto.createHash('sha256').update(cleaned).digest('hex');
}

module.exports = { encrypt, decrypt, deterministicHash };
