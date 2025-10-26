const bcrypt = require('bcryptjs');
const fp = require('fastify-plugin');
const { prisma } = require('./db');
const { CONFIG } = require('./config');

async function bootstrapAdmin(fastify) {
  const count = await prisma.user.count();
  if (count > 0) return;
  if (!CONFIG.ADMIN_EMAIL || !CONFIG.ADMIN_PASSWORD) {
    fastify.log.warn('没有用户且未设置 ADMIN_EMAIL/ADMIN_PASSWORD 环境变量，无法创建管理员账户');
    return;
  }
  const passwordHash = await bcrypt.hash(CONFIG.ADMIN_PASSWORD, 10);
  await prisma.user.create({
    data: { email: CONFIG.ADMIN_EMAIL, passwordHash, isAdmin: true },
  });
  fastify.log.info('已从环境变量创建管理员账户');
}

const authPlugin = fp(async function (fastify) {
  await fastify.register(require('@fastify/jwt'), { secret: CONFIG.JWT_SECRET });

  fastify.decorate('auth', {
    async verify(request, reply) {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.code(401).send({ error: '未授权访问，请重新登录' });
      }
    },
  });

  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return reply.code(401).send({ error: '邮箱或密码错误' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: '邮箱或密码错误' });
    const token = fastify.jwt.sign({ sub: user.id, email: user.email, isAdmin: user.isAdmin }, { expiresIn: '7d' });
    return { token };
  });

  await bootstrapAdmin(fastify);
});

module.exports = { authPlugin };
