# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm + bash (bash needed for scripts/build-agent-bundle.sh pipefail)
RUN apk add --no-cache bash && npm install -g pnpm@9.0.0

# Copy root configurations
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY tsconfig.base.json ./

# Copy apps and packages
COPY apps/ ./apps/
COPY packages/ ./packages/
COPY scripts/ ./scripts/

# Install dependencies and build
RUN pnpm install --frozen-lockfile

# Build version
ARG BUILD_VERSION=dev
ARG BUILD_TIME=unknown
ENV VITE_BUILD_VERSION=$BUILD_VERSION
ENV VITE_BUILD_TIME=$BUILD_TIME
RUN pnpm build

# Produce the self-contained swarm-agent tarball served by the backend's
# admin-issued one-liner installer. Needs `pnpm build` above to have run so
# packages/swarm-agent/dist exists; the script does `pnpm deploy --prod` to
# collect ws + storage-plan into a staging folder, then tars it.
RUN mkdir -p apps/backend/assets && \
    bash scripts/build-agent-bundle.sh apps/backend/assets/agent-bundle.tgz

# Production Stage - Backend
FROM node:20-alpine AS backend
WORKDIR /app
RUN npm install -g pnpm@9.0.0
RUN apk add --no-cache curl \
    && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/backend/package.json ./apps/backend/
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/assets ./apps/backend/assets
# Workspace packages the backend requires at runtime (storage-plan) or via its
# own package.json entries (swarm-agent — devDep in spirit, listed as dep so
# pnpm must still resolve the workspace:* reference). Dist + package.json are
# enough; src is not needed in the runtime image.
COPY --from=builder /app/packages/storage-plan/package.json ./packages/storage-plan/
COPY --from=builder /app/packages/storage-plan/dist ./packages/storage-plan/dist
COPY --from=builder /app/packages/swarm-agent/package.json ./packages/swarm-agent/
COPY --from=builder /app/packages/swarm-agent/dist ./packages/swarm-agent/dist
RUN pnpm install --prod --frozen-lockfile
EXPOSE 3001
CMD ["node", "apps/backend/dist/main"]

# Production Stage - Frontend
FROM nginx:alpine AS frontend
COPY apps/frontend/nginx-main.conf /etc/nginx/nginx.conf
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
