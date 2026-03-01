# SwarmUI - Portainer Business Edition Alternatifi
## Mimari Plan v1.0

> **Stack:** NestJS + MongoDB (Backend) | React (Frontend) | Docker Swarm (Hedef)
> **Tarih:** 2026-03-01

---

## 1. Proje Klasör Yapısı (Monorepo)

```
swarmui/
├── apps/
│   ├── backend/                        # NestJS API
│   │   ├── src/
│   │   │   ├── modules/                # Feature modülleri
│   │   │   │   ├── auth/
│   │   │   │   ├── users/
│   │   │   │   ├── teams/
│   │   │   │   ├── roles/
│   │   │   │   ├── endpoints/          # Docker endpoint yönetimi
│   │   │   │   ├── containers/
│   │   │   │   ├── swarm/
│   │   │   │   │   ├── nodes/
│   │   │   │   │   ├── services/
│   │   │   │   │   └── stacks/
│   │   │   │   ├── images/
│   │   │   │   ├── registries/
│   │   │   │   ├── networks/
│   │   │   │   ├── volumes/
│   │   │   │   ├── templates/
│   │   │   │   ├── gitops/
│   │   │   │   ├── backup/
│   │   │   │   ├── notifications/
│   │   │   │   ├── activity-logs/
│   │   │   │   ├── security/
│   │   │   │   └── settings/
│   │   │   ├── common/
│   │   │   │   ├── decorators/
│   │   │   │   ├── guards/             # AuthGuard, RbacGuard
│   │   │   │   ├── interceptors/       # Logging, Transform
│   │   │   │   ├── filters/            # Exception filters
│   │   │   │   ├── pipes/
│   │   │   │   └── utils/
│   │   │   ├── docker/
│   │   │   │   ├── docker.service.ts   # Dockerode wrapper
│   │   │   │   └── docker.module.ts
│   │   │   ├── config/
│   │   │   │   ├── app.config.ts
│   │   │   │   ├── mongo.config.ts
│   │   │   │   └── jwt.config.ts
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── test/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── frontend/                       # React SPA
│       ├── src/
│       │   ├── pages/
│       │   │   ├── auth/               # Login, OAuth callback
│       │   │   ├── dashboard/
│       │   │   ├── containers/
│       │   │   ├── swarm/
│       │   │   │   ├── nodes/
│       │   │   │   ├── services/
│       │   │   │   └── stacks/
│       │   │   ├── images/
│       │   │   ├── registries/
│       │   │   ├── networks/
│       │   │   ├── volumes/
│       │   │   ├── templates/
│       │   │   ├── gitops/
│       │   │   ├── users/
│       │   │   ├── teams/
│       │   │   ├── roles/
│       │   │   ├── logs/
│       │   │   ├── backup/
│       │   │   ├── security/
│       │   │   └── settings/
│       │   ├── components/
│       │   │   ├── layout/             # Sidebar, Topbar, Breadcrumb
│       │   │   ├── shared/             # DataTable, Modal, Form, Badge
│       │   │   ├── docker/             # ContainerCard, ServiceCard
│       │   │   ├── charts/             # ResourceChart, LogChart
│       │   │   └── terminal/           # WebSocket terminal (xterm.js)
│       │   ├── api/                    # Axios client + React Query hooks
│       │   ├── store/                  # Zustand global state
│       │   ├── hooks/
│       │   ├── types/
│       │   └── utils/
│       ├── public/
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   ├── shared-types/                   # Ortak TypeScript tipleri
│   │   ├── src/
│   │   │   ├── docker.types.ts
│   │   │   ├── api.types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── shared-utils/                   # Ortak yardımcı fonksiyonlar
│       ├── src/
│       │   ├── validators.ts
│       │   └── formatters.ts
│       └── package.json
│
├── infrastructure/
│   ├── docker/
│   │   ├── docker-compose.yml          # Geliştirme ortamı
│   │   ├── docker-compose.prod.yml     # Prodüksiyon
│   │   └── docker-compose.swarm.yml    # Swarm deploy stack
│   ├── mongo/
│   │   ├── init.js                     # DB init script
│   │   └── indexes.js
│   └── nginx/
│       └── nginx.conf
│
├── docs/
│   ├── api/                            # OpenAPI/Swagger
│   ├── architecture/
│   └── deployment/
│
├── scripts/
│   ├── seed.ts                         # Geliştirme seed datası
│   ├── migrate.ts
│   └── backup.sh
│
├── turbo.json                          # Turborepo config
├── package.json                        # Root workspace
├── .env.example
└── PLAN.md
```

---

## 2. Backend Modülleri ve Sorumlulukları

### 2.1 Auth Modülü (`/modules/auth`)
**Sorumluluk:** Kimlik doğrulama ve oturum yönetimi

| Servis | Açıklama |
|--------|----------|
| `AuthService` | Login, logout, token yenileme |
| `JwtStrategy` | Passport JWT doğrulama |
| `LocalStrategy` | Kullanıcı/şifre doğrulama |
| `OAuthService` | GitHub, GitLab, Google OAuth2 flow |
| `LdapService` | LDAP/Active Directory bağlantısı ve sorgulama |
| `MfaService` | TOTP tabanlı 2FA (speakeasy) |

**Dış Bağımlılıklar:** `passport-jwt`, `passport-local`, `passport-oauth2`, `ldapjs`, `speakeasy`

---

### 2.2 Users Modülü (`/modules/users`)
**Sorumluluk:** Kullanıcı CRUD ve profil yönetimi

| Servis | Açıklama |
|--------|----------|
| `UsersService` | Kullanıcı oluştur/güncelle/sil |
| `UsersController` | REST endpoint'ler |
| `PasswordService` | bcrypt hash/verify, şifre politikası |

---

### 2.3 Teams Modülü (`/modules/teams`)
**Sorumluluk:** Takım yönetimi ve üyelik

| Servis | Açıklama |
|--------|----------|
| `TeamsService` | Takım CRUD, üye ekle/çıkar |
| `MembershipService` | Kullanıcı-takım ilişkileri |

---

### 2.4 Roles Modülü (`/modules/roles`)
**Sorumluluk:** RBAC rol ve izin tanımları

| Servis | Açıklama |
|--------|----------|
| `RolesService` | Rol CRUD (Admin, Operator, Helpdesk, Read-only, Edge Admin, vb.) |
| `PermissionsService` | İzin matrisi yönetimi |
| `RbacGuard` | Her request'te yetki kontrolü |

**Rol Hiyerarşisi:**
```
Administrator
  └── Operator
        └── Helpdesk
              └── Standard User
                    └── Read-Only
```

---

### 2.5 Endpoints Modülü (`/modules/endpoints`)
**Sorumluluk:** Docker endpoint (ortam) yönetimi

| Servis | Açıklama |
|--------|----------|
| `EndpointsService` | Endpoint CRUD ve bağlantı testi |
| `EndpointGroupsService` | Endpoint grupları |
| `TlsService` | TLS sertifika yönetimi |
| `AgentService` | Swarm agent bağlantısı (portainer agent eşdeğeri) |

**Endpoint Tipleri:** Local Socket, TCP, TLS-TCP, Swarm Agent

---

### 2.6 Containers Modülü (`/modules/containers`)
**Sorumluluk:** Container yaşam döngüsü yönetimi

| Servis | Açıklama |
|--------|----------|
| `ContainersService` | List, create, start, stop, restart, kill, remove |
| `ContainerLogsService` | Log streaming (SSE veya WebSocket) |
| `ContainerStatsService` | CPU/RAM/Net/Disk metrikleri (streaming) |
| `ContainerExecService` | Exec/attach → terminal WebSocket |
| `ContainerInspectService` | Detay bilgi, inspect |

---

### 2.7 Swarm Modülü (`/modules/swarm`)
**Sorumluluk:** Docker Swarm orkestrasyon yönetimi

#### Nodes Alt-Modülü
| Servis | Açıklama |
|--------|----------|
| `NodesService` | Node listele, inspect, güncelle (availability, role) |

#### Services Alt-Modülü
| Servis | Açıklama |
|--------|----------|
| `ServicesService` | Service CRUD, scale, force update, rollback |
| `ServiceLogsService` | Service log streaming |
| `ServiceTasksService` | Task (container) listesi per service |

#### Stacks Alt-Modülü
| Servis | Açıklama |
|--------|----------|
| `StacksService` | Stack deploy (compose), update, remove |
| `StackFileService` | docker-compose.yml parse ve validasyon |
| `StackEditorService` | Compose dosyası düzenleme |

---

### 2.8 Images Modülü (`/modules/images`)
**Sorumluluk:** Image yönetimi

| Servis | Açıklama |
|--------|----------|
| `ImagesService` | List, pull, push, remove, tag |
| `ImageBuildService` | Dockerfile'dan build (stream output) |
| `ImageInspectService` | Layer, history, inspect |

---

### 2.9 Registries Modülü (`/modules/registries`)
**Sorumluluk:** Container registry yönetimi

| Servis | Açıklama |
|--------|----------|
| `RegistriesService` | Registry CRUD (DockerHub, GCR, ECR, ACR, private) |
| `RegistryAuthService` | Auth credentials yönetimi (şifreli) |
| `RegistryCatalogService` | Registry catalog API (image/tag listesi) |

---

### 2.10 Networks Modülü (`/modules/networks`)
**Sorumluluk:** Docker network yönetimi

| Servis | Açıklama |
|--------|----------|
| `NetworksService` | List, create (bridge/overlay/macvlan), remove, connect/disconnect |
| `NetworkInspectService` | Bağlı containerlar, IP bilgisi |

---

### 2.11 Volumes Modülü (`/modules/volumes`)
**Sorumluluk:** Docker volume yönetimi

| Servis | Açıklama |
|--------|----------|
| `VolumesService` | List, create, remove, prune |
| `VolumeInspectService` | Detay, kullanım bilgisi |

---

### 2.12 Templates Modülü (`/modules/templates`)
**Sorumluluk:** Uygulama şablonları

| Servis | Açıklama |
|--------|----------|
| `TemplatesService` | Hazır (built-in) + özel template CRUD |
| `TemplateDeployService` | Template'den container/stack deploy |
| `TemplateImportService` | URL'den template import (Portainer formatı uyumlu) |

---

### 2.13 GitOps Modülü (`/modules/gitops`)
**Sorumluluk:** Git tabanlı otomatik deploy

| Servis | Açıklama |
|--------|----------|
| `GitopsService` | Git repo bağlantısı ve polling |
| `WebhookService` | GitHub/GitLab webhook handler |
| `DeploymentService` | Stack/service otomatik güncelleme |
| `GitCredentialsService` | SSH key / PAT yönetimi |

**Çalışma Mekanizması:**
```
Git Push → Webhook → WebhookService → Stack diff → Swarm deploy
           veya
Cron Poll → Git diff → Değişiklik var mı? → Evet → Deploy
```

---

### 2.14 Backup Modülü (`/modules/backup`)
**Sorumluluk:** Sistem yedekleme

| Servis | Açıklama |
|--------|----------|
| `BackupService` | Manuel backup (DB + config) |
| `ScheduledBackupService` | Cron tabanlı otomatik backup |
| `S3BackupService` | AWS S3 / MinIO upload |
| `RestoreService` | Backup geri yükleme |

---

### 2.15 Notifications Modülü (`/modules/notifications`)
**Sorumluluk:** Bildirim yönetimi

| Servis | Açıklama |
|--------|----------|
| `NotificationsService` | In-app bildirim CRUD |
| `EmailNotificationService` | SMTP mail gönderimi |
| `WebhookNotificationService` | Slack/Teams/custom webhook |
| `EventBusService` | İç event sistemi (NestJS EventEmitter2) |

---

### 2.16 Activity Logs Modülü (`/modules/activity-logs`)
**Sorumluluk:** Tüm kullanıcı işlemlerini kayıt altına alma

| Servis | Açıklama |
|--------|----------|
| `ActivityLogsService` | Log yazma, sorgulama, filtreleme |
| `ActivityLogInterceptor` | Her API çağrısını otomatik logla |

**Log Kategorileri:** Auth, Container, Swarm, Image, Registry, Network, Volume, Template, GitOps, Backup, User, Team, Role, Settings

---

### 2.17 Security Modülü (`/modules/security`)
**Sorumluluk:** Docker güvenlik politikaları

| Servis | Açıklama |
|--------|----------|
| `SecurityPolicyService` | Politika tanımı (no-new-privileges, read-only root, vb.) |
| `SecurityScanService` | Image güvenlik taraması (Trivy entegrasyonu) |
| `SecretsService` | Docker secrets yönetimi |
| `ConfigsService` | Docker configs yönetimi |

---

### 2.18 Settings Modülü (`/modules/settings`)
**Sorumluluk:** Sistem ayarları

| Servis | Açıklama |
|--------|----------|
| `SettingsService` | Genel ayarlar (CRUD) |
| `LicenseService` | Lisans doğrulama (gelecek) |
| `EdgeService` | Edge agent yönetimi (gelecek) |

---

## 3. Frontend Sayfaları ve Componentleri

### 3.1 Sayfa Listesi

| Sayfa | Yol | Açıklama |
|-------|-----|----------|
| Login | `/auth/login` | Yerel + OAuth + LDAP |
| Dashboard | `/` | Genel özet, cluster durumu |
| Containers | `/containers` | Container listesi |
| Container Detail | `/containers/:id` | Logs, Stats, Exec, Inspect |
| Swarm Nodes | `/swarm/nodes` | Node listesi ve yönetimi |
| Swarm Services | `/swarm/services` | Service listesi |
| Service Detail | `/swarm/services/:id` | Tasks, Logs, Scale |
| Swarm Stacks | `/swarm/stacks` | Stack listesi |
| Stack Detail | `/swarm/stacks/:id` | Services, compose editor |
| Images | `/images` | Image listesi, pull, build |
| Image Detail | `/images/:id` | Layers, history |
| Registries | `/registries` | Registry listesi |
| Networks | `/networks` | Network listesi |
| Network Detail | `/networks/:id` | Bağlı containerlar |
| Volumes | `/volumes` | Volume listesi |
| Templates | `/templates` | App template galerisi |
| GitOps | `/gitops` | Git deployment listesi |
| GitOps Detail | `/gitops/:id` | Deployment geçmişi, ayarlar |
| Users | `/users` | Kullanıcı yönetimi |
| User Detail | `/users/:id` | Profil, roller, aktivite |
| Teams | `/teams` | Takım yönetimi |
| Team Detail | `/teams/:id` | Üyeler, yetkiler |
| Roles | `/roles` | RBAC rol yönetimi |
| Activity Logs | `/logs/activity` | Filtrelenebilir aktivite log |
| Auth Logs | `/logs/auth` | Giriş/çıkış logları |
| Notification Logs | `/logs/notifications` | Bildirim geçmişi |
| Backup | `/backup` | Backup/restore yönetimi |
| Security | `/security` | Güvenlik politikaları, secrets |
| Settings | `/settings` | Sistem ayarları |
| Settings Auth | `/settings/auth` | OAuth/LDAP konfigürasyonu |

---

### 3.2 Temel Componentler

#### Layout Componentleri
```
<AppShell>
  <Sidebar>                    # Navigasyon menüsü (collapsible)
  <Topbar>                     # Endpoint seçici, bildirimler, profil
  <Breadcrumb>
  <PageContent>
```

#### Shared (Ortak) Componentler
```
<DataTable>                    # Sıralanabilir, filtreli, sayfalı tablo
<ConfirmModal>                 # Silme onay modalı
<StatusBadge>                  # running/stopped/error badge
<SearchBar>                    # Debounced arama
<ResourceUsageBar>             # CPU/RAM mini progress bar
<JsonViewer>                   # Inspect çıktısı için
<YamlEditor>                   # Monaco Editor - compose dosyası
<CopyButton>                   # Clipboard kopyalama
<RelativeTime>                 # "3 dakika önce" formatı
<EmptyState>                   # Veri yoksa placeholder
<LoadingSpinner>
<ErrorBoundary>
```

#### Docker Spesifik Componentler
```
<ContainerCard>                # Liste kartı (durum, kaynak özeti)
<ContainerConsole>             # xterm.js WebSocket terminal
<ContainerLogs>                # Streaming log viewer
<ContainerStats>               # Recharts CPU/RAM/Net grafiği
<ServiceCard>
<ServiceScaleModal>
<StackComposeEditor>           # Monaco YAML editor + diff view
<NodeCard>                     # Swarm node durumu
<ImagePullModal>
<NetworkTopology>              # Basit ağ topoloji görselleştirme
<TemplateCard>                 # Template galeri kartı
<TemplateDeployModal>          # Env var form ile deploy
```

#### Form Componentleri
```
<ContainerCreateForm>          # Container oluşturma wizard
<ServiceCreateForm>            # Service oluşturma wizard
<UserCreateForm>
<TeamForm>
<RoleForm>
<RegistryForm>
<GitopsForm>                   # Repo URL, branch, path
<BackupScheduleForm>
<SecurityPolicyForm>
```

---

## 4. MongoDB Şema Tasarımı

### 4.1 `users` Koleksiyonu
```typescript
{
  _id: ObjectId,
  username: string,             // unique
  email: string,                // unique
  passwordHash: string,         // null for OAuth users
  displayName: string,
  avatar?: string,
  role: 'admin' | 'standard',   // global sistem rolü
  authProvider: 'local' | 'oauth' | 'ldap',
  oauthProvider?: string,       // 'github' | 'gitlab' | 'google'
  oauthId?: string,
  ldapDn?: string,
  mfaEnabled: boolean,
  mfaSecret?: string,           // encrypted
  refreshTokenHash?: string,
  lastLoginAt?: Date,
  isActive: boolean,
  createdAt: Date,
  updatedAt: Date
}
// Index: username(unique), email(unique), oauthId
```

### 4.2 `teams` Koleksiyonu
```typescript
{
  _id: ObjectId,
  name: string,                 // unique
  description?: string,
  members: [
    {
      userId: ObjectId,
      role: 'leader' | 'member'
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
// Index: name(unique), members.userId
```

### 4.3 `roles` Koleksiyonu
```typescript
{
  _id: ObjectId,
  name: string,                 // unique
  description?: string,
  isBuiltin: boolean,           // sistem rolleri değiştirilemez
  permissions: [
    {
      resource: string,         // 'containers', 'services', 'stacks', ...
      actions: string[]         // ['list', 'create', 'delete', 'exec', ...]
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

### 4.4 `endpoint_access` Koleksiyonu (RBAC join tablosu)
```typescript
{
  _id: ObjectId,
  endpointId: ObjectId,
  subjectType: 'user' | 'team',
  subjectId: ObjectId,
  roleId: ObjectId,
  createdAt: Date
}
// Index: (endpointId, subjectType, subjectId) unique
```

### 4.5 `endpoints` Koleksiyonu
```typescript
{
  _id: ObjectId,
  name: string,
  type: 'local' | 'tcp' | 'tls' | 'agent',
  url: string,                  // 'unix:///var/run/docker.sock' | 'tcp://...'
  groupId?: ObjectId,
  tls?: {
    ca: string,                 // sertifika path veya content (encrypted)
    cert: string,
    key: string
  },
  agentToken?: string,          // encrypted
  tags: string[],
  isSwarm: boolean,
  swarmId?: string,
  dockerVersion?: string,       // son kontrol edilen versiyon
  status: 'active' | 'down' | 'unknown',
  lastCheckedAt?: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### 4.6 `endpoint_groups` Koleksiyonu
```typescript
{
  _id: ObjectId,
  name: string,
  description?: string,
  createdAt: Date
}
```

### 4.7 `registries` Koleksiyonu
```typescript
{
  _id: ObjectId,
  name: string,
  type: 'dockerhub' | 'gcr' | 'ecr' | 'acr' | 'gitlab' | 'quay' | 'custom',
  url: string,
  username?: string,
  passwordEncrypted?: string,   // AES-256 şifreli
  authentication: boolean,
  accessList: [                 // hangi user/team erişebilir
    {
      subjectType: 'user' | 'team',
      subjectId: ObjectId
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

### 4.8 `templates` Koleksiyonu
```typescript
{
  _id: ObjectId,
  type: 'container' | 'swarm-service' | 'stack',
  title: string,
  description: string,
  logo?: string,
  image?: string,               // container/service için
  composeContent?: string,      // stack için
  categories: string[],
  platform: 'linux' | 'windows' | 'any',
  env: [
    {
      name: string,
      label: string,
      description?: string,
      default?: string,
      select?: { text: string, value: string, default?: boolean }[],
      required: boolean,
      preset: boolean
    }
  ],
  ports: string[],              // ['80/tcp', '443/tcp']
  volumes: [
    { container: string, bind?: string }
  ],
  network?: string,
  isBuiltin: boolean,
  isPublic: boolean,
  createdBy?: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

### 4.9 `gitops_deployments` Koleksiyonu
```typescript
{
  _id: ObjectId,
  name: string,
  endpointId: ObjectId,
  stackName: string,
  repositoryUrl: string,
  branch: string,
  composePath: string,          // 'docker-compose.yml'
  credentialId?: ObjectId,      // git_credentials ref
  autoUpdate: boolean,
  pollingInterval?: number,     // saniye (0 = disabled)
  webhookToken?: string,        // webhook URL token
  lastCommitHash?: string,
  lastDeployedAt?: Date,
  status: 'active' | 'error' | 'pending',
  deployHistory: [
    {
      commitHash: string,
      deployedAt: Date,
      trigger: 'webhook' | 'poll' | 'manual',
      success: boolean,
      error?: string
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

### 4.10 `git_credentials` Koleksiyonu
```typescript
{
  _id: ObjectId,
  name: string,
  ownerId: ObjectId,
  type: 'password' | 'token' | 'ssh',
  username?: string,
  passwordEncrypted?: string,
  tokenEncrypted?: string,
  sshPrivateKeyEncrypted?: string,
  createdAt: Date,
  updatedAt: Date
}
```

### 4.11 `backup_jobs` Koleksiyonu
```typescript
{
  _id: ObjectId,
  name: string,
  schedule?: string,            // cron expression
  destination: 'local' | 's3',
  s3Config?: {
    bucket: string,
    region: string,
    accessKeyId: string,        // encrypted
    secretAccessKey: string,    // encrypted
    prefix?: string
  },
  password?: string,            // backup şifreleme (encrypted)
  retention: number,            // kaç backup sakla
  lastRunAt?: Date,
  nextRunAt?: Date,
  status: 'idle' | 'running' | 'success' | 'error',
  history: [
    {
      startedAt: Date,
      completedAt?: Date,
      filePath?: string,
      fileSize?: number,
      success: boolean,
      error?: string
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

### 4.12 `activity_logs` Koleksiyonu
```typescript
{
  _id: ObjectId,
  userId?: ObjectId,
  username?: string,            // denormalized (user silinse bile)
  action: string,               // 'container.create', 'stack.deploy', ...
  resourceType: string,
  resourceId?: string,
  resourceName?: string,
  endpointId?: ObjectId,
  payload?: Record<string, any>, // istek detayı (hassas alanlar temizlenmiş)
  ipAddress: string,
  userAgent?: string,
  statusCode: number,
  duration: number,             // ms
  timestamp: Date
}
// Index: timestamp(desc), userId, action, endpointId
// TTL Index: timestamp - 90 gün sonra otomatik sil (konfigüre edilebilir)
```

### 4.13 `auth_logs` Koleksiyonu
```typescript
{
  _id: ObjectId,
  userId?: ObjectId,
  username: string,
  action: 'login' | 'logout' | 'failed_login' | 'token_refresh' | 'mfa_challenge',
  provider: 'local' | 'oauth' | 'ldap',
  success: boolean,
  failReason?: string,
  ipAddress: string,
  userAgent?: string,
  timestamp: Date
}
// TTL Index: timestamp - 30 gün
```

### 4.14 `notifications` Koleksiyonu
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  title: string,
  message: string,
  type: 'info' | 'success' | 'warning' | 'error',
  category: 'system' | 'container' | 'service' | 'stack' | 'backup' | 'gitops',
  isRead: boolean,
  link?: string,                // ilgili kaynak URL
  createdAt: Date
}
// Index: userId + isRead + createdAt
```

### 4.15 `security_policies` Koleksiyonu
```typescript
{
  _id: ObjectId,
  name: string,
  endpointId?: ObjectId,        // null = global
  rules: {
    noNewPrivileges: boolean,
    readOnlyRootFilesystem: boolean,
    dropCapabilities: string[],
    allowedCapabilities: string[],
    allowPrivileged: boolean,
    runAsNonRoot: boolean,
    allowedRegistries: string[], // [] = all allowed
    requiredLabels: Record<string, string>,
    resourceLimits: {
      enforceCpuLimit: boolean,
      enforceMemoryLimit: boolean
    }
  },
  enforcement: 'warn' | 'block',
  isActive: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### 4.16 `settings` Koleksiyonu (tek döküman)
```typescript
{
  _id: ObjectId,
  // Auth
  authMethod: 'local' | 'ldap' | 'oauth',
  sessionTimeout: number,       // dakika
  // LDAP
  ldap?: {
    url: string,
    baseDn: string,
    bindDn: string,
    bindPasswordEncrypted: string,
    searchFilter: string,
    groupBaseDn?: string,
    adminGroup?: string,
    tlsEnabled: boolean
  },
  // OAuth
  oauth?: {
    provider: string,
    clientId: string,
    clientSecretEncrypted: string,
    authUrl: string,
    tokenUrl: string,
    userUrl: string,
    scopes: string[],
    defaultRole: string,
    autoCreateUsers: boolean
  },
  // Notifications
  smtp?: {
    host: string,
    port: number,
    secure: boolean,
    username: string,
    passwordEncrypted: string,
    from: string
  },
  // Logs
  logRetentionDays: {
    activity: number,           // default: 90
    auth: number,               // default: 30
    notifications: number       // default: 60
  },
  // Security
  enforceHttps: boolean,
  allowedOrigins: string[],
  // Templates
  templateUrl: string,          // external template JSON URL
  updatedAt: Date
}
```

---

## 5. API Endpoint Grupları

### 5.1 Auth (`/api/auth`)
```
POST   /auth/login                    # Local login
POST   /auth/logout
POST   /auth/refresh                  # Token yenile
GET    /auth/oauth/:provider          # OAuth redirect
GET    /auth/oauth/:provider/callback # OAuth callback
POST   /auth/mfa/verify               # 2FA doğrula
POST   /auth/mfa/enable
POST   /auth/mfa/disable
GET    /auth/ldap/test                # LDAP bağlantı testi (admin)
```

### 5.2 Users (`/api/users`)
```
GET    /users                         # Liste (admin)
POST   /users                         # Oluştur (admin)
GET    /users/me                      # Mevcut kullanıcı profili
PUT    /users/me                      # Profil güncelle
PUT    /users/me/password             # Şifre değiştir
GET    /users/:id                     # Detay (admin)
PUT    /users/:id                     # Güncelle (admin)
DELETE /users/:id                     # Sil (admin)
GET    /users/:id/teams               # Kullanıcı takımları
GET    /users/:id/activity            # Aktivite logları
```

### 5.3 Teams (`/api/teams`)
```
GET    /teams
POST   /teams
GET    /teams/:id
PUT    /teams/:id
DELETE /teams/:id
GET    /teams/:id/members
POST   /teams/:id/members             # Üye ekle { userId, role }
PUT    /teams/:id/members/:userId     # Rol değiştir
DELETE /teams/:id/members/:userId     # Üye çıkar
```

### 5.4 Roles (`/api/roles`)
```
GET    /roles
POST   /roles
GET    /roles/:id
PUT    /roles/:id
DELETE /roles/:id                     # builtin roller silinemez
```

### 5.5 Endpoints (`/api/endpoints`)
```
GET    /endpoints
POST   /endpoints
GET    /endpoints/:id
PUT    /endpoints/:id
DELETE /endpoints/:id
POST   /endpoints/:id/test            # Bağlantı testi
GET    /endpoints/:id/access          # Erişim listesi
PUT    /endpoints/:id/access          # Erişim güncelle
GET    /endpoints/groups
POST   /endpoints/groups
PUT    /endpoints/groups/:id
DELETE /endpoints/groups/:id
```

### 5.6 Containers (`/api/endpoints/:endpointId/containers`)
```
GET    /containers                    # ?all=true&filters=...
POST   /containers                    # Oluştur
GET    /containers/:id
GET    /containers/:id/logs           # SSE stream
GET    /containers/:id/stats          # SSE stream
POST   /containers/:id/start
POST   /containers/:id/stop
POST   /containers/:id/restart
POST   /containers/:id/kill
POST   /containers/:id/pause
POST   /containers/:id/unpause
POST   /containers/:id/rename
DELETE /containers/:id
POST   /containers/:id/exec           # WebSocket upgrade
GET    /containers/:id/inspect
POST   /containers/prune
```

### 5.7 Swarm (`/api/endpoints/:endpointId/swarm`)
```
GET    /swarm                         # Swarm inspect
POST   /swarm/init
POST   /swarm/join
POST   /swarm/leave

GET    /swarm/nodes
GET    /swarm/nodes/:id
PUT    /swarm/nodes/:id               # availability, role
DELETE /swarm/nodes/:id

GET    /swarm/services
POST   /swarm/services
GET    /swarm/services/:id
PUT    /swarm/services/:id
DELETE /swarm/services/:id
GET    /swarm/services/:id/logs       # SSE
GET    /swarm/services/:id/tasks
POST   /swarm/services/:id/scale      # { replicas }
POST   /swarm/services/:id/forceupdate
POST   /swarm/services/:id/rollback

GET    /swarm/stacks
POST   /swarm/stacks                  # { name, composeContent, env }
GET    /swarm/stacks/:id
PUT    /swarm/stacks/:id
DELETE /swarm/stacks/:id
GET    /swarm/stacks/:id/file         # compose dosyasını döndür

GET    /swarm/configs
POST   /swarm/configs
GET    /swarm/configs/:id
DELETE /swarm/configs/:id

GET    /swarm/secrets
POST   /swarm/secrets
GET    /swarm/secrets/:id
DELETE /swarm/secrets/:id
```

### 5.8 Images (`/api/endpoints/:endpointId/images`)
```
GET    /images
POST   /images/pull                   # SSE stream (pull progress)
POST   /images/build                  # SSE stream (build output)
GET    /images/:id
GET    /images/:id/history
POST   /images/:id/tag
POST   /images/:id/push               # SSE stream
DELETE /images/:id
POST   /images/prune
```

### 5.9 Registries (`/api/registries`)
```
GET    /registries
POST   /registries
GET    /registries/:id
PUT    /registries/:id
DELETE /registries/:id
POST   /registries/:id/test           # Auth testi
GET    /registries/:id/catalog        # Image listesi
GET    /registries/:id/tags/:image    # Tag listesi
```

### 5.10 Networks (`/api/endpoints/:endpointId/networks`)
```
GET    /networks
POST   /networks
GET    /networks/:id
DELETE /networks/:id
POST   /networks/:id/connect          # { container }
POST   /networks/:id/disconnect       # { container }
POST   /networks/prune
```

### 5.11 Volumes (`/api/endpoints/:endpointId/volumes`)
```
GET    /volumes
POST   /volumes
GET    /volumes/:name
DELETE /volumes/:name
POST   /volumes/prune
```

### 5.12 Templates (`/api/templates`)
```
GET    /templates                     # ?type=container|stack|swarm-service
POST   /templates                     # Özel template oluştur
GET    /templates/:id
PUT    /templates/:id
DELETE /templates/:id
POST   /templates/:id/deploy          # Template'den deploy
POST   /templates/refresh             # URL'den yeniden çek
```

### 5.13 GitOps (`/api/gitops`)
```
GET    /gitops
POST   /gitops
GET    /gitops/:id
PUT    /gitops/:id
DELETE /gitops/:id
POST   /gitops/:id/deploy             # Manuel trigger
GET    /gitops/:id/history            # Deployment geçmişi
POST   /gitops/webhooks/:token        # Webhook endpoint (public)

GET    /gitops/credentials
POST   /gitops/credentials
DELETE /gitops/credentials/:id
POST   /gitops/credentials/test       # { url, credentialId }
```

### 5.14 Backup (`/api/backup`)
```
GET    /backup/jobs
POST   /backup/jobs
GET    /backup/jobs/:id
PUT    /backup/jobs/:id
DELETE /backup/jobs/:id
POST   /backup/jobs/:id/run           # Manuel çalıştır
GET    /backup/jobs/:id/history
POST   /backup/restore                # Multipart backup dosyası yükle
```

### 5.15 Logs (`/api/logs`)
```
GET    /logs/activity                 # ?userId=&action=&from=&to=&page=&limit=
GET    /logs/auth                     # ?userId=&success=&from=&to=
GET    /logs/notifications            # Sistem notification logları
DELETE /logs/activity                 # Temizle (admin, tarih aralığı)
```

### 5.16 Security (`/api/security`)
```
GET    /security/policies
POST   /security/policies
GET    /security/policies/:id
PUT    /security/policies/:id
DELETE /security/policies/:id
POST   /security/scan                 # { image, endpointId } - Trivy scan
GET    /security/scan/:id             # Scan sonucu
```

### 5.17 Settings (`/api/settings`)
```
GET    /settings
PUT    /settings
GET    /settings/auth                 # Auth konfigürasyonu
PUT    /settings/auth
POST   /settings/ldap/test
POST   /settings/oauth/test
GET    /settings/smtp
PUT    /settings/smtp
POST   /settings/smtp/test
```

### 5.18 WebSocket Endpoints
```
WS     /ws/containers/:id/exec        # Exec terminal
WS     /ws/containers/:id/logs        # Log stream
WS     /ws/containers/:id/stats       # Stats stream
WS     /ws/services/:id/logs          # Service log stream
WS     /ws/events                     # Docker global event stream
```

---

## 6. Geliştirme Aşamaları

### Phase 0: Altyapı Kurulumu (1-2 Hafta)
**Hedef:** Geliştirme ortamının hazırlanması

- [ ] Monorepo kurulumu (Turborepo + pnpm workspaces)
- [ ] Backend: NestJS proje iskeleti
  - `@nestjs/config`, `@nestjs/mongoose`, `@nestjs/jwt`, `@nestjs/passport`
  - `@nestjs/swagger` (OpenAPI dokümantasyon)
  - `@nestjs/event-emitter`, `@nestjs/bull` (job queues)
  - `@nestjs/schedule` (cron jobs)
  - `dockerode` (Docker API client)
- [ ] Frontend: React proje iskeleti (Vite + TypeScript)
  - `tanstack/react-query` (server state)
  - `zustand` (client state)
  - `react-router-dom v6`
  - `shadcn/ui` + `tailwindcss` (UI framework)
  - `monaco-editor` (YAML/compose editor)
  - `xterm.js` (terminal emülatörü)
  - `recharts` (metrik grafikleri)
  - `axios` (HTTP client)
- [ ] `packages/shared-types` kurulumu
- [ ] Docker Compose geliştirme ortamı (MongoDB, Redis)
- [ ] CI/CD pipeline iskelet (GitHub Actions)
- [ ] ESLint, Prettier, Husky pre-commit hooks
- [ ] Ortam değişkeni yönetimi (`.env.example`)

---

### Phase 1: Core - Auth & User Yönetimi (2-3 Hafta)
**Hedef:** Temel kimlik doğrulama ve kullanıcı sistemi

**Backend:**
- [ ] Auth modülü: JWT (access + refresh token çifti)
- [ ] Local authentication (bcrypt)
- [ ] Users CRUD
- [ ] Teams CRUD + üyelik
- [ ] Roles + RBAC altyapısı (`RbacGuard`)
- [ ] ActivityLog interceptor (tüm API çağrılarını otomatik log)
- [ ] Auth log
- [ ] Endpoint yönetimi (CRUD + bağlantı testi)
- [ ] Docker service (Dockerode wrapper, multi-endpoint)
- [ ] Settings (temel)

**Frontend:**
- [ ] Login sayfası
- [ ] App shell (sidebar, topbar)
- [ ] Users sayfası
- [ ] Teams sayfası
- [ ] Roles sayfası
- [ ] Endpoint yönetim sayfası
- [ ] Settings sayfası (temel)
- [ ] API client + React Query hooks
- [ ] Zustand auth store

**Çıktı:** Çalışan login, kullanıcı/takım/rol yönetimi, endpoint ekleme

---

### Phase 2: Container Yönetimi (2-3 Hafta)
**Hedef:** Tek node Docker container yönetimi

**Backend:**
- [ ] Containers modülü (tüm lifecycle)
- [ ] Container logs SSE + WebSocket
- [ ] Container stats SSE
- [ ] Container exec WebSocket
- [ ] Images modülü (pull, build, push, remove)
- [ ] Networks modülü
- [ ] Volumes modülü
- [ ] Docker global events WebSocket

**Frontend:**
- [ ] Dashboard (genel özet)
- [ ] Containers listesi + işlemler (start/stop/restart/remove)
- [ ] Container detay: Logs, Stats grafikleri, Exec terminal, Inspect
- [ ] Images sayfası + pull modal
- [ ] Networks sayfası
- [ ] Volumes sayfası

**Çıktı:** Portainer CE seviyesinde container yönetimi

---

### Phase 3: Docker Swarm Yönetimi (3-4 Hafta)
**Hedef:** Swarm orkestrasyon özellikleri

**Backend:**
- [ ] Swarm modülü (init, join, leave)
- [ ] Nodes (list, update, drain)
- [ ] Services (CRUD, scale, force-update, rollback, logs)
- [ ] Stacks (deploy, update, remove, compose parse)
- [ ] Secrets + Configs yönetimi

**Frontend:**
- [ ] Swarm overview (cluster durumu, node haritası)
- [ ] Nodes sayfası (availability, role değiştirme)
- [ ] Services sayfası + detay (tasks, logs, scale modal)
- [ ] Stacks sayfası + compose editor (Monaco YAML)
- [ ] Stack detay (services listesi, güncelleme)
- [ ] Secrets + Configs sayfaları

**Çıktı:** Tam Docker Swarm yönetimi

---

### Phase 4: Registry, Templates & GitOps (2-3 Hafta)
**Hedef:** Image yönetimi ekosistemi ve otomasyon

**Backend:**
- [ ] Registries modülü (multi-registry, auth, catalog)
- [ ] Templates modülü (built-in + özel, URL import)
- [ ] Template deploy (container/service/stack)
- [ ] GitOps modülü (repo bağlantı, polling)
- [ ] Webhook handler (GitHub/GitLab imzası doğrulama)
- [ ] Git credentials yönetimi
- [ ] BullMQ job queue (gitops polling, backup scheduler)

**Frontend:**
- [ ] Registries sayfası
- [ ] Templates galerisi (kategoriler, arama, deploy modal)
- [ ] GitOps sayfası (deployment listesi)
- [ ] GitOps detay (geçmiş, ayarlar, manuel trigger)
- [ ] Git credentials yönetimi

**Çıktı:** Otomatik Git-tabanlı deploy, template galerisi

---

### Phase 5: Enterprise Özellikler (3-4 Hafta)
**Hedef:** Kurumsal entegrasyonlar ve gelişmiş özellikler

**Backend:**
- [ ] OAuth2 entegrasyonu (GitHub, GitLab, Google)
- [ ] LDAP/Active Directory entegrasyonu
- [ ] TOTP (2FA) desteği
- [ ] Backup modülü (local + S3)
- [ ] Scheduled backup (cron)
- [ ] Email notifications (SMTP)
- [ ] Webhook notifications (Slack, Teams)
- [ ] Security policies modülü
- [ ] Trivy image scan entegrasyonu
- [ ] Log retention ve TTL yönetimi

**Frontend:**
- [ ] Settings/Auth sayfası (OAuth, LDAP konfigürasyonu)
- [ ] 2FA enable/disable
- [ ] Backup sayfası (jobs, geçmiş, restore)
- [ ] Activity logs sayfası (filtreli, export)
- [ ] Auth logs sayfası
- [ ] Notification logs + bildirim merkezi
- [ ] Security policies sayfası
- [ ] Image security scan sonuçları

**Çıktı:** Kurumsal kullanıma hazır sistem

---

### Phase 6: Polish & Production (2-3 Hafta)
**Hedef:** Prodüksiyon hazırlığı

- [ ] E2E test suite (Playwright)
- [ ] Unit testler (backend %80 coverage hedefi)
- [ ] Performance optimizasyonu (MongoDB indexler, query tuning)
- [ ] Rate limiting ve DDoS koruması
- [ ] Helmet, CORS, CSRF korumaları
- [ ] Docker Swarm stack deploy konfigürasyonu
- [ ] Health check endpoint'leri
- [ ] Prometheus metrikleri (`@willsoto/nestjs-prometheus`)
- [ ] OpenAPI dokümantasyon tamamlama
- [ ] Deployment dokümantasyonu

**Çıktı:** Prodüksiyona deploy edilebilir sistem

---

## 7. Teknik Kararlar ve Gerekçeleri

### 7.1 Monorepo: Turborepo + pnpm Workspaces
**Neden:** `shared-types` paketini backend ve frontend arasında paylaşmak için monorepo şart. Turborepo, bağımlılık grafiğini anlayarak paralel build ve akıllı cache sunar. pnpm ise node_modules disk kullanımını minimize eder.

### 7.2 Backend: NestJS
**Neden:** Modüler mimari (her özellik kendi modülü), decorator tabanlı DI, built-in DI container, Swagger entegrasyonu, WebSocket ve SSE desteği. TypeScript-first olması tip güvenliğini sağlar. Express veya Fastify adapter seçeneği sunar.

### 7.3 Database: MongoDB
**Neden:** Docker kaynaklarının (container, service, stack, node) şema-sız ve iç içe yapısı MongoDB'nin document modeline çok iyi uyuyor. Docker inspect çıktısı doğrudan saklanabilir. BSON, Docker'ın JSON API yanıtlarıyla doğal eşleşir.

**Mongoose:** Şema validasyon ve tip güvenliği için. Zod ile DTO validasyonu eklenir.

### 7.4 Real-time: SSE + WebSocket Hibrit Yaklaşım
**Neden:**
- **SSE (Server-Sent Events):** Tek yönlü streaming (logs, stats, build output). HTTP üzerinden çalışır, proxy/load balancer uyumluluğu yüksek.
- **WebSocket:** Çift yönlü iletişim gereken exec terminal ve global Docker event stream için.

### 7.5 Job Queue: BullMQ + Redis
**Neden:** GitOps polling, scheduled backup ve image scan gibi arka plan işler için. Redis ile persistent queue, retry mekanizması, delay ve cron support. `@nestjs/bull` veya `@nestjs/bullmq` ile NestJS entegrasyonu hazır.

### 7.6 Frontend State: React Query + Zustand
**Neden:**
- **React Query (TanStack Query):** Server state için (cache, stale-while-revalidate, refetch on focus, infinite queries). API çağrılarının büyük çoğunluğu için idealdir.
- **Zustand:** Client-only state için (sidebar durumu, seçili endpoint, terminal oturumları). Redux'a göre çok daha minimal ve boilerplate-free.

### 7.7 UI Framework: shadcn/ui + Tailwind CSS
**Neden:** shadcn/ui bileşenleri kaynak kodunu projeye kopyalar (lock-in yok), tamamen özelleştirilebilir. Tailwind ile tasarım tutarlılığı ve hız. Radix UI primitifleri üzerinde kurulu olduğu için erişilebilirlik (a11y) hazır gelir.

### 7.8 YAML/Compose Editörü: Monaco Editor
**Neden:** VS Code'un editörü. YAML syntax highlighting, validation, ve diff view desteği. Docker compose şeması JSON Schema ile entegre edilerek in-editor hata gösterimi sağlanabilir.

### 7.9 Terminal: xterm.js
**Neden:** Docker exec için industry-standard WebSocket terminal. Portainer da aynısını kullanır. Full xterm emülasyonu, resize support, copy-paste.

### 7.10 Docker API Client: Dockerode
**Neden:** Node.js için en olgun Docker API client. Unix socket, TCP ve TLS desteği. Stream API (pull, build, logs) için callback ve Promise desteği. TypeScript tip tanımları mevcut.

### 7.11 Şifreleme: AES-256-GCM
**Neden:** Registry şifreleri, git credentials, LDAP şifreleri, backup şifreleri gibi hassas veriler DB'ye şifreli kaydedilmeli. AES-256-GCM authenticated encryption sunar (veri bütünlüğü de doğrulanır). Anahtar `APP_ENCRYPTION_KEY` env'den alınır.

### 7.12 Token Stratejisi: Access + Refresh Token Çifti
**Neden:**
- **Access Token:** Kısa ömürlü (15dk), her API isteğinde gönderilir, memory'de tutulur (XSS'e karşı).
- **Refresh Token:** Uzun ömürlü (7 gün), HttpOnly Secure cookie olarak gönderilir (XSS koruması), DB'de hash'i saklanır (revoke edilebilir).

### 7.13 Multi-Endpoint Mimarisi
**Neden:** Portainer gibi birden fazla Docker ortamını yönetebilmek için. Her API isteğinde `:endpointId` parametresi ile hangi Docker daemon'a bağlanılacağı belirlenir. `DockerService` connection pooling ile aynı endpoint'e tekrar bağlanmaz.

### 7.14 Security-First Yaklaşım
- Helmet (HTTP security headers)
- CORS (whitelist bazlı)
- Rate limiting (`@nestjs/throttler`) - özellikle login endpoint'i
- Input validation (class-validator + class-transformer)
- SQL/NoSQL injection koruması (Mongoose type casting)
- RBAC her endpoint'de (global guard + decorator)
- Audit log (tüm veri değiştiren işlemler)

---

## 8. Dağıtım Mimarisi

```
                    ┌─────────────────────────────────┐
                    │         Docker Swarm Cluster      │
                    │                                   │
Internet ──────────►│  Nginx (Ingress/Load Balancer)   │
                    │           ↓                       │
                    │  ┌────────────────────────────┐  │
                    │  │      Frontend (React SPA)  │  │
                    │  │      served by Nginx       │  │
                    │  └────────────────────────────┘  │
                    │           ↓                       │
                    │  ┌────────────────────────────┐  │
                    │  │    Backend (NestJS API)    │  │◄── Docker Socket
                    │  │    replicas: 2+            │  │    (Read-Only)
                    │  └────────────────────────────┘  │
                    │      ↓             ↓              │
                    │  ┌──────┐    ┌──────────┐        │
                    │  │Mongo │    │  Redis   │        │
                    │  │ RS   │    │ (BullMQ) │        │
                    │  └──────┘    └──────────┘        │
                    └─────────────────────────────────-─┘
```

**Önemli Notlar:**
- Backend, Docker socket'e **read-only** erişim ile değil, kontrollü bir şekilde bağlanır (swarm manager node üzerinde)
- MongoDB Replica Set ile high availability
- Redis için Sentinel veya Cluster modu (prod)
- Tüm servisler Docker secrets ile hassas veri alır (env değil)

---

## 9. Başlangıç Komutları (Planlanan)

```bash
# Monorepo kurulumu
pnpm install

# Geliştirme ortamı başlat
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Backend geliştirme
pnpm --filter backend dev

# Frontend geliştirme
pnpm --filter frontend dev

# Tüm build
pnpm build

# Test
pnpm test

# Seed data
pnpm --filter backend seed
```

---

*Son güncelleme: 2026-03-01 | SwarmUI v1.0 Mimari Planı*
