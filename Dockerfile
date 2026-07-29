# Stage 1: Build Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:22-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: Runtime Container
FROM node:22-alpine AS runner
WORKDIR /app

# Install native dependencies required by better-sqlite3 if needed
RUN apk add --no-cache sqlite-dev

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_CACHE_DIR=/data/cache
ENV DATA_DB_DIR=/data/db

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN mkdir -p /data/cache /data/db /app && chown -R node:node /data /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
