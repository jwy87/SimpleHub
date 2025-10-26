const crypto = require('crypto');
const { CONFIG } = require('./config');

function getKey() {
  const raw = CONFIG.ENCRYPTION_KEY || '';
  if (!raw) throw new Error('ENCRYPTION_KEY is required');
  try {
    if (/^[A-Fa-f0-9]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) return b;
  } catch (_) {}
  return crypto.scryptSync(raw, 'ai-relay-monitor', 32);
}

const KEY = (() => getKey())();

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, ct]).toString('base64');
  return `v1:${payload}`;
}

function decrypt(payload) {
  if (!payload) return '';
  const [ver, data] = payload.split(':');
  if (ver !== 'v1') throw new Error('Unsupported enc version');
  const buf = Buffer.from(data, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  return pt;
}

module.exports = { encrypt, decrypt };
