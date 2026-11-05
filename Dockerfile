# Production Dockerfile for VIGILORA Next.js 16 Standalone (Node.js 22 LTS)
# Multi-stage build optimized for minimal container image size (< 150 MB)

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# 1. Install dependencies based on package-lock.json
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# 2. Build the application with Next.js standalone output
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Ensure output: 'standalone' is enabled for container build without permanently altering host config
RUN node -e "const fs = require('fs'); let c = fs.readFileSync('next.config.ts', 'utf8'); if (!c.includes('standalone')) { c = c.replace('cacheComponents: true,', 'output: \"standalone\",\n  cacheComponents: true,'); fs.writeFileSync('next.config.ts', c); }" && npm run build

# 3. Production runtime runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets and pre-built standalone server
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
