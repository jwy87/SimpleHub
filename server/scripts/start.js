const { spawn } = require('child_process');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

(async () => {
  try {
    await run('npx', ['prisma', 'db', 'push']);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Prisma db push failed:', e.message);
  }
  require('../src/server');
})();
