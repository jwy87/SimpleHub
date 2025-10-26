const path = require('path');
const fs = require('fs');
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const fastifyStatic = require('@fastify/static');
const { CONFIG } = require('./config');
const { routes } = require('./routes');
const { scheduleAll, scheduleGlobalTask } = require('./scheduler');
const { prisma } = require('./db');

async function buildServer() {
  const fastify = Fastify({ logger: true });
  if (CONFIG.NODE_ENV !== 'production') {
    await fastify.register(cors, { origin: true, credentials: true });
  }

  // Static file path for Docker: /app/web/dist (when __dirname is /app/src)
  const staticRoot = path.join(__dirname, '..', 'web', 'dist');
  console.log('[Static Files] Checking path:', staticRoot);
  console.log('[Static Files] Path exists:', fs.existsSync(staticRoot));
  console.log('[Static Files] __dirname:', __dirname);
  
  if (fs.existsSync(staticRoot)) {
    await fastify.register(fastifyStatic, { 
      root: staticRoot, 
      prefix: '/',
      decorateReply: false // 避免冲突
    });
    console.log('[Static Files] Registered successfully');
    
    // 列出静态文件目录内容（调试用）
    try {
      const files = fs.readdirSync(staticRoot);
      console.log('[Static Files] Directory contents:', files);
    } catch (e) {
      console.warn('[Static Files] Cannot read directory:', e.message);
    }
  } else {
    console.warn('[Static Files] Directory not found:', staticRoot);
  }

  await fastify.register(routes);

  if (fs.existsSync(staticRoot)) {
    fastify.setNotFoundHandler((req, reply) => {
      // For SPA, serve index.html for non-API routes
      if (!req.url.startsWith('/api/')) {
        const indexPath = path.join(staticRoot, 'index.html');
        if (fs.existsSync(indexPath)) {
          return reply.type('text/html').send(fs.readFileSync(indexPath));
        }
      }
      reply.code(404).send({ error: 'Not found' });
    });
  }

  await scheduleAll(fastify);
  
  // 加载全局定时任务配置
  try {
    const scheduleConfig = await prisma.scheduleConfig.findFirst();
    if (scheduleConfig) {
      await scheduleGlobalTask(scheduleConfig, fastify);
      fastify.log.info({ config: scheduleConfig }, 'Global schedule task initialized');
    }
  } catch (e) {
    fastify.log.warn({ err: e.message }, 'Failed to initialize global schedule task');
  }
  
  return fastify;
}

buildServer()
  .then((app) => app.listen({ port: CONFIG.PORT, host: '0.0.0.0' }))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });

module.exports = { buildServer };
