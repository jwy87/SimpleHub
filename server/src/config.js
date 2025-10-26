require('dotenv').config();
const path = require('path');

function env(name, def) {
  const v = process.env[name];
  // 只有环境变量未定义时才使用默认值
  // 如果用户明确设置了环境变量（即使是空字符串），也使用用户设置的值
  return v === undefined ? def : v;
}

// 生成默认的加密密钥（32字符）
const DEFAULT_ENCRYPTION_KEY = 'ai-monitor-default-encryption';
const DEFAULT_JWT_SECRET = 'ai-monitor-default-jwt-secret-key-for-development';

const CONFIG = {
  PORT: parseInt(env('PORT', '3000'), 10),
  JWT_SECRET: env('JWT_SECRET', DEFAULT_JWT_SECRET),
  ADMIN_EMAIL: env('ADMIN_EMAIL', 'admin@example.com'),
  ADMIN_PASSWORD: env('ADMIN_PASSWORD', 'admin123456'),
  ENCRYPTION_KEY: env('ENCRYPTION_KEY', DEFAULT_ENCRYPTION_KEY),
  DATABASE_URL: env('DATABASE_URL', `file:${path.join(process.cwd(), 'data', 'db.sqlite')}`),
  NODE_ENV: env('NODE_ENV', 'development'),
};

// 安全警告：如果使用默认密钥，在生产环境发出警告
if (CONFIG.NODE_ENV === 'production') {
  if (CONFIG.JWT_SECRET === DEFAULT_JWT_SECRET) {
    console.warn('\n⚠️  警告: 正在使用默认的 JWT_SECRET，这在生产环境中不安全！');
    console.warn('   请设置环境变量 JWT_SECRET 为一个强随机字符串\n');
  }
  if (CONFIG.ENCRYPTION_KEY === DEFAULT_ENCRYPTION_KEY) {
    console.warn('\n⚠️  警告: 正在使用默认的 ENCRYPTION_KEY，这在生产环境中不安全！');
    console.warn('   请设置环境变量 ENCRYPTION_KEY 为一个32字符的强随机字符串\n');
  }
  if (CONFIG.ADMIN_EMAIL === 'admin@example.com' || CONFIG.ADMIN_PASSWORD === 'admin123456') {
    console.warn('\n⚠️  警告: 正在使用默认的管理员账号密码，这在生产环境中不安全！');
    console.warn('   请设置环境变量 ADMIN_EMAIL 和 ADMIN_PASSWORD\n');
  }
}

module.exports = { CONFIG };
