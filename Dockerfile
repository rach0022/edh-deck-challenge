# ─── EDH Deck Challenge API ──────────────────────────────────────────────────
# Root-level Dockerfile for local Docker development.
# Build context is the repo root; all paths reference backend/.

FROM node:26-slim AS base

# Install Chromium and dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# ─── Dependencies ────────────────────────────────────────────────────────────
FROM base AS deps
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

# ─── Build ───────────────────────────────────────────────────────────────────
FROM base AS build
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/tsconfig.json ./tsconfig.json
COPY backend/src ./src
RUN npm run build

# ─── Production ──────────────────────────────────────────────────────────────
FROM base AS production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY backend/package.json ./

ENV HOME=/tmp

RUN groupadd -r appuser && useradd -r -g appuser -d /tmp appuser
USER appuser

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
