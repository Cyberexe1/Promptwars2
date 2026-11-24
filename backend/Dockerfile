# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: install dependencies and compile TypeScript
# ---------------------------------------------------------------------------
FROM public.ecr.aws/docker/library/node:22-alpine AS build

WORKDIR /app

# Copy manifests first so dependency installation is cached independently of
# source changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build


# ---------------------------------------------------------------------------
# Stage 2: production dependencies only
# ---------------------------------------------------------------------------
FROM public.ecr.aws/docker/library/node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
# `npm ci --omit=dev` keeps TypeScript, Vitest, and tsx out of the final image.
RUN npm ci --omit=dev && npm cache clean --force


# ---------------------------------------------------------------------------
# Stage 3: runtime
# ---------------------------------------------------------------------------
FROM public.ecr.aws/docker/library/node:22-alpine AS runtime

# dumb-init gives PID 1 correct signal handling, so App Runner's SIGTERM
# reaches Node and the graceful shutdown in server.ts actually runs.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# The base image ships a non-root `node` user. Run as that, never as root.
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./

USER node

EXPOSE 3000

# App Runner polls /health over HTTP; this HEALTHCHECK is for local parity.
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
