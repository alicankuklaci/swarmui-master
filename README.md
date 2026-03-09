# 🐳 SwarmUI Master

<p align="center">
  <img src="https://img.shields.io/badge/Docker%20Swarm-Management-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/NestJS-Backend-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
  <img src="https://img.shields.io/badge/React-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-Full%20Stack-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</p>

<p align="center">
  <b>A modern, open-source Docker Swarm management platform — a self-hosted alternative to Portainer Business Edition.</b>
</p>

---

## ✨ Features

| Category | Features |
|----------|----------|
| 📊 **Dashboard** | Real-time cluster overview, resource charts (CPU/RAM), node health |
| 🐳 **Containers** | List, inspect, logs (ANSI colored), stats, console, exec |
| ⚙️ **Services** | Scale, rollback, update, environment variables, port mapping |
| 📦 **Stacks** | Monaco YAML editor, live compose reconstruction from Docker API |
| 🖥️ **Nodes** | Node list, roles, availability, resource usage |
| 🗺️ **Cluster Visualizer** | Visual topology of nodes and running tasks |
| 🔐 **Security** | Secrets, configs, RBAC (users, roles, teams) |
| 🔑 **API Keys** | Scoped programmatic access (read / write / admin) with `X-Api-Key` |
| 🌍 **i18n** | English 🇬🇧 · Turkish 🇹🇷 · German 🇩🇪 · French 🇫🇷 |
| 🗄️ **Registries** | Docker Hub, ECR, GCR, private registry credentials |
| 📋 **Audit Logs** | Full activity trail, syslog export (UDP/TCP, RFC 5424) |
| 🔄 **GitOps** | Deployment change windows, scheduling |
| 💾 **Backup** | Cluster config backup with JWT-authenticated download |
| 🔌 **Auth** | Local, LDAP, OAuth2/SSO |

---

## 🚀 Quick Start

### Prerequisites
- Docker Swarm cluster (at least 1 manager node)
- Docker Compose v3.8+

### Deploy with Docker Stack

```bash
git clone https://github.com/alicankuklaci/swarmui-master.git
cd swarmui-master
docker stack deploy -c docker-compose.yml swarmui-master
```

Access at: **http://YOUR_MANAGER_IP:1519**  
Default credentials: `root` / `root`

> ⚠️ Change your password immediately after first login.

---

## 🏗️ Architecture

```
swarmui-master/
├── apps/
│   ├── backend/           # NestJS API server
│   │   └── src/modules/
│   │       ├── swarm/     # Docker Swarm API integration
│   │       ├── auth/      # JWT + LDAP + OAuth
│   │       ├── api-keys/  # API key management
│   │       ├── backup/    # Backup service
│   │       └── ...
│   └── frontend/          # React + Vite SPA
│       ├── src/pages/     # All UI pages
│       └── src/i18n/      # EN/TR/DE/FR locales
└── docker-compose.yml
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS 10, TypeScript, Mongoose |
| Database | MongoDB 4.4 |
| Cache | Redis 7 |
| Proxy | nginx |
| Auth | JWT, bcrypt, Passport.js |
| Editor | Monaco Editor |
| Charts | Recharts |
| i18n | react-i18next |

---

## ⚙️ Configuration

### Environment Variables (Backend)

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `changeme` | JWT signing secret |
| `MONGODB_URI` | `mongodb://mongo:27017/swarmui` | MongoDB connection |
| `REDIS_HOST` | `redis` | Redis host |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path |
| `LDAP_URL` | — | LDAP server URL (optional) |
| `SYSLOG_HOST` | — | Syslog server host (optional) |

### docker-compose.yml

```yaml
version: "3.8"
services:
  frontend:
    image: alicankuklaci/swarmui-master-frontend:latest
    ports:
      - "1519:80"
    networks:
      - swarmui-net

  backend:
    image: alicankuklaci/swarmui-master-backend:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - JWT_SECRET=your-secret-here
      - MONGODB_URI=mongodb://mongo:27017/swarmui
    deploy:
      placement:
        constraints:
          - node.role == manager
    networks:
      - swarmui-net

  mongo:
    image: mongo:4.4
    volumes:
      - mongo_data:/data/db
    networks:
      - swarmui-net

  redis:
    image: redis:7.2-alpine
    networks:
      - swarmui-net

volumes:
  mongo_data:

networks:
  swarmui-net:
    driver: overlay
```

---

## 🔑 API Key Usage

Generate a key from **Settings → API Keys**, then:

```bash
# List services
curl -H "X-Api-Key: sk-xxxxxxxxxxxxxxxx" \
  http://YOUR_HOST:1519/api/v1/endpoints/{id}/swarm/services

# Deploy a stack
curl -X POST \
  -H "X-Api-Key: sk-xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"name":"myapp","composeContent":"..."}' \
  http://YOUR_HOST:1519/api/v1/endpoints/{id}/swarm/stacks
```

---

## 🌍 Internationalization

Change the language from the 🌐 globe icon in the top bar.

| Language | Code | Status |
|----------|------|--------|
| English | `en` | ✅ Complete |
| Turkish | `tr` | ✅ Complete |
| German | `de` | ✅ Complete |
| French | `fr` | ✅ Complete |

---

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Start all services in dev mode
pnpm dev

# Build for production
pnpm build

# Build Docker images
docker build --target frontend -t swarmui-frontend .
docker build --target backend  -t swarmui-backend  .
```

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push: `git push origin feat/amazing-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

- Inspired by [Portainer](https://www.portainer.io/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)

---

<p align="center">
  Made with ❤️ &nbsp;—&nbsp; <a href="https://github.com/alicankuklaci/swarmui-master">⭐ Star this repo</a> if you find it useful!
</p>

---

## ☕ Support

If you find this project useful, consider supporting its development:

<p align="center">
  <b>💜 USDT (TRC-20)</b><br/>
  <code>TKpa9EFYbm1ppQoeemrqH28NJdBeTUSjfC</code>
</p>

