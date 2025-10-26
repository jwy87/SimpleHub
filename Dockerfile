# Build web frontend
FROM node:18-alpine AS webbuild
WORKDIR /web
COPY web/package*.json ./
# 安装所有依赖（包括 devDependencies，因为需要 vite 等构建工具）
RUN npm ci || npm install
COPY web/ ./
RUN npm run build

# Build server and generate Prisma client
FROM node:18-alpine AS serverbuild
WORKDIR /server
COPY server/package*.json ./
# 先安装所有依赖以生成 Prisma client
RUN npm ci || npm install
COPY server/prisma ./prisma
RUN npx prisma generate
COPY server/ ./
# 清理 devDependencies 以减小体积
RUN npm prune --production

# Final production image (use Debian-based image for better Prisma compatibility)
FROM node:18-slim AS runtime
LABEL maintainer="AI Model Monitor"
LABEL description="AI中转站模型监测系统"

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update && \
    apt-get install -y openssl ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set production environment
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL="file:/app/data/db.sqlite"

# Create non-root user and data directory
RUN useradd -m -d /app -s /bin/bash appuser && \
    mkdir -p /app/data && \
    chown -R appuser:appuser /app

# Copy application files
COPY --from=serverbuild --chown=appuser:appuser /server /app
COPY --from=webbuild --chown=appuser:appuser /web/dist /app/web/dist

# Verify files were copied
RUN ls -la /app && ls -la /app/web && ls -la /app/web/dist || true

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT}/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Expose port
EXPOSE 3000

# Volume for persistent data
VOLUME ["/app/data"]

# Start application
CMD ["node", "scripts/start.js"]
