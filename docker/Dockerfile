FROM node:20-alpine AS base

# Install dependencies for canvas/sharp
RUN apk add --no-cache libc6-compat python3 make g++ cairo-dev pango-dev jpeg-dev giflib-dev ffmpeg

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

# ── Migrator (used by the migrate service in docker-compose) ──────────────────
# Uses the full builder node_modules so prisma CLI works with all its deps
FROM builder AS migrator
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy"]

# ── Production runner ─────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

RUN mkdir -p uploads && chown nextjs:nodejs uploads

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Just start the server — migrations are run by the migrate service
CMD ["node", "server.js"]
