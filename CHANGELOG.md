# Changelog

All notable changes to SwarmUI Master will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-03-09

### Added
- 📊 Dashboard with real-time cluster overview and resource charts
- 🐳 Container management — logs (ANSI), stats, console, exec
- ⚙️ Service management — scale, rollback, update, env vars
- 📦 Stack editor with Monaco YAML editor
- 🖥️ Node list with roles, availability, resource usage
- 🗺️ Cluster Visualizer — visual topology of nodes and tasks
- 🔐 Security — Secrets, Configs, RBAC (users, roles, teams)
- 🔑 API Keys — scoped access (read/write/admin) via `X-Api-Key` header
- 🌍 i18n — English, Turkish, German, French
- 🗄️ Registry credential management
- 📋 Audit logs with syslog export (UDP/TCP, RFC 5424)
- 🔄 GitOps change window scheduling
- 💾 Backup with JWT-authenticated download
- 🔌 LDAP & OAuth2/SSO authentication

### Security
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Content-Security-Policy`
- nginx version hidden via `server_tokens off`
- JWT `alg:none` attack protection
- NoSQL injection protection via class-validator DTO

---

## Versioning Policy

This project follows **Semantic Versioning**:

- **MAJOR** (`v2.0.0`) — Breaking changes (API rename, schema changes, removed features)
- **MINOR** (`v1.1.0`) — New features, backward compatible
- **PATCH** (`v1.0.1`) — Bug fixes, backward compatible

### What counts as a Breaking Change?

- Renaming or removing an API endpoint
- Changing MongoDB document structure without migration
- Changing environment variable names
- Removing frontend routes or changing their paths
- JWT secret rotation (logs out all users)

### Upgrade Safety

Each release will note in this file whether it requires:
- `[DB MIGRATION]` — run migration script before updating
- `[ENV UPDATE]` — update your `docker-compose.yml` environment variables
- `[SAFE]` — drop-in replacement, no action needed

[Unreleased]: https://github.com/alicankuklaci/swarmui-master/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/alicankuklaci/swarmui-master/releases/tag/v1.0.0
