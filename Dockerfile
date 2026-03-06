FROM node:20-slim AS base
LABEL maintainer="IronTracks"
LABEL description="Build environment for IronTracks — eliminates NFD/JDK issues"

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Set safe encoding (fixes macOS NFD issue)
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

WORKDIR /app

# Install deps first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source
COPY . .

# ──── Quality Gates ────────────────────────────────────────────
FROM base AS check

# 1. Type check
RUN npx tsc --noEmit

# 2. Lint
RUN npm run lint

# 3. Unit tests
RUN npm run test:unit

# 4. Smoke tests
RUN npm run test:smoke

# 5. Build
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

# ──── Production image ─────────────────────────────────────────
FROM node:20-slim AS production
WORKDIR /app

COPY --from=check /app/.next ./.next
COPY --from=check /app/public ./public
COPY --from=check /app/package.json ./
COPY --from=check /app/node_modules ./node_modules

EXPOSE 3000
CMD ["npm", "start"]
