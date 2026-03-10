# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.0.0

# Copy root configurations
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY tsconfig.base.json ./

# Copy apps and packages
COPY apps/ ./apps/
COPY packages/ ./packages/

# Install dependencies and build
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Production Stage - Backend
FROM node:20-alpine AS backend
WORKDIR /app
RUN npm install -g pnpm@9.0.0
RUN apk add --no-cache curl \
    && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/backend/package.json ./apps/backend/
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
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
