import { Injectable, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Template, TemplateDocument } from './schemas/template.schema';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';

const BUILTIN_TEMPLATES = [
  {
    type: 'container',
    title: 'Nginx',
    description: 'High performance web server',
    logo: 'https://nginxproxymanager.com/icon.png',
    image: 'nginx:alpine',
    categories: ['webserver'],
    ports: [{ host: 80, container: 80, protocol: 'tcp' }],
    volumes: [{ container: '/usr/share/nginx/html' }],
    env: [],
    isBuiltin: true,
    isPublic: true,
  },
  {
    type: 'container',
    title: 'MySQL',
    description: 'MySQL relational database',
    logo: 'https://www.mysql.com/common/logos/mysql-logo.svg',
    image: 'mysql:8',
    categories: ['database'],
    ports: [{ host: 3306, container: 3306, protocol: 'tcp' }],
    volumes: [{ container: '/var/lib/mysql' }],
    env: [
      { name: 'MYSQL_ROOT_PASSWORD', label: 'Root Password', required: true },
      { name: 'MYSQL_DATABASE', label: 'Database Name', default: 'mydb' },
      { name: 'MYSQL_USER', label: 'User', default: 'dbuser' },
      { name: 'MYSQL_PASSWORD', label: 'User Password', required: true },
    ],
    isBuiltin: true,
    isPublic: true,
  },
  {
    type: 'container',
    title: 'Redis',
    description: 'In-memory data structure store',
    logo: 'https://redis.io/images/redis-logo.svg',
    image: 'redis:7-alpine',
    categories: ['cache', 'database'],
    ports: [{ host: 6379, container: 6379, protocol: 'tcp' }],
    volumes: [{ container: '/data' }],
    env: [],
    isBuiltin: true,
    isPublic: true,
  },
  {
    type: 'stack',
    title: 'WordPress',
    description: 'WordPress with MySQL backend',
    logo: 'https://s.w.org/style/images/about/WordPress-logotype-wmark.png',
    image: '',
    categories: ['cms'],
    ports: [],
    volumes: [],
    env: [
      { name: 'MYSQL_ROOT_PASSWORD', label: 'MySQL Root Password', required: true },
      { name: 'WORDPRESS_DB_PASSWORD', label: 'WordPress DB Password', required: true },
    ],
    composeContent: `version: '3.8'
services:
  db:
    image: mysql:5.7
    volumes:
      - db_data:/var/lib/mysql
    environment:
      MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: \${WORDPRESS_DB_PASSWORD}
  wordpress:
    image: wordpress:latest
    ports:
      - "8080:80"
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: \${WORDPRESS_DB_PASSWORD}
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wp_data:/var/www/html
    depends_on:
      - db
volumes:
  db_data:
  wp_data:
`,
    isBuiltin: true,
    isPublic: true,
  },
  {
    type: 'container',
    title: 'Grafana',
    description: 'Open source analytics and monitoring solution',
    logo: 'https://grafana.com/static/img/menu/grafana2.svg',
    image: 'grafana/grafana:latest',
    categories: ['monitoring'],
    ports: [{ host: 3000, container: 3000, protocol: 'tcp' }],
    volumes: [{ container: '/var/lib/grafana' }],
    env: [
      { name: 'GF_SECURITY_ADMIN_PASSWORD', label: 'Admin Password', default: 'admin' },
    ],
    isBuiltin: true,
    isPublic: true,
  },
  {
    type: 'container',
    title: 'MongoDB',
    description: 'NoSQL document database',
    logo: 'https://www.mongodb.com/assets/images/global/leaf.png',
    image: 'mongo:4.4',
    categories: ['database'],
    ports: [{ host: 27017, container: 27017, protocol: 'tcp' }],
    volumes: [{ container: '/data/db' }],
    env: [
      { name: 'MONGO_INITDB_ROOT_USERNAME', label: 'Root Username', default: 'admin' },
      { name: 'MONGO_INITDB_ROOT_PASSWORD', label: 'Root Password', required: true },
    ],
    isBuiltin: true,
    isPublic: true,
  },
  {
    type: 'container',
    title: 'PostgreSQL',
    description: 'Advanced open source relational database',
    logo: 'https://www.postgresql.org/media/img/about/press/elephant.png',
    image: 'postgres:15-alpine',
    categories: ['database'],
    ports: [{ host: 5432, container: 5432, protocol: 'tcp' }],
    volumes: [{ container: '/var/lib/postgresql/data' }],
    env: [
      { name: 'POSTGRES_USER', label: 'Username', default: 'postgres' },
      { name: 'POSTGRES_PASSWORD', label: 'Password', required: true },
      { name: 'POSTGRES_DB', label: 'Database', default: 'mydb' },
    ],
    isBuiltin: true,
    isPublic: true,
  },
  {
    type: 'container',
    title: 'Portainer Agent',
    description: 'Portainer Agent for remote endpoint management',
    logo: 'https://portainer.io/images/portainer-logo-black.svg',
    image: 'portainer/agent:latest',
    categories: ['management'],
    ports: [{ host: 9001, container: 9001, protocol: 'tcp' }],
    volumes: [
      { bind: '/var/run/docker.sock', container: '/var/run/docker.sock' },
      { bind: '/var/lib/docker/volumes', container: '/var/lib/docker/volumes' },
    ],
    env: [],
    isBuiltin: true,
    isPublic: true,
  },
  {
    type: 'container',
    title: 'RabbitMQ',
    description: 'Message broker with management UI',
    logo: 'https://www.rabbitmq.com/img/rabbitmq-logo.svg',
    image: 'rabbitmq:3-management-alpine',
    categories: ['messaging'],
    ports: [
      { host: 5672, container: 5672, protocol: 'tcp' },
      { host: 15672, container: 15672, protocol: 'tcp' },
    ],
    volumes: [{ container: '/var/lib/rabbitmq' }],
    env: [
      { name: 'RABBITMQ_DEFAULT_USER', label: 'Username', default: 'admin' },
      { name: 'RABBITMQ_DEFAULT_PASS', label: 'Password', required: true },
    ],
    isBuiltin: true,
    isPublic: true,
  },
  {
    type: 'container',
    title: 'MinIO',
    description: 'High-performance S3-compatible object storage',
    logo: 'https://min.io/resources/img/logo.svg',
    image: 'minio/minio:latest',
    categories: ['storage'],
    ports: [
      { host: 9000, container: 9000, protocol: 'tcp' },
      { host: 9001, container: 9001, protocol: 'tcp' },
    ],
    volumes: [{ container: '/data' }],
    env: [
      { name: 'MINIO_ROOT_USER', label: 'Root User', default: 'minioadmin' },
      { name: 'MINIO_ROOT_PASSWORD', label: 'Root Password', required: true },
    ],
    note: 'Command: server /data --console-address :9001',
    isBuiltin: true,
    isPublic: true,
  },
  {
    type: 'container',
    title: 'Prometheus',
    description: 'Monitoring system and time series database',
    logo: 'https://prometheus.io/assets/prometheus_logo_grey.svg',
    image: 'prom/prometheus:latest',
    categories: ['monitoring'],
    ports: [{ host: 9090, container: 9090, protocol: 'tcp' }],
    volumes: [{ container: '/prometheus' }],
    env: [],
    isBuiltin: true,
    isPublic: true,
  },
  {
    type: 'container',
    title: 'Elasticsearch',
    description: 'Distributed search and analytics engine',
    logo: 'https://www.elastic.co/android-chrome-192x192.png',
    image: 'elasticsearch:8.11.0',
    categories: ['search', 'database'],
    ports: [
      { host: 9200, container: 9200, protocol: 'tcp' },
      { host: 9300, container: 9300, protocol: 'tcp' },
    ],
    volumes: [{ container: '/usr/share/elasticsearch/data' }],
    env: [
      { name: 'discovery.type', label: 'Discovery Type', default: 'single-node' },
      { name: 'ELASTIC_PASSWORD', label: 'Elastic Password', required: true },
    ],
    isBuiltin: true,
    isPublic: true,
  },
  {
    type: 'stack',
    title: 'SeaweedFS Distributed Storage',
    description: 'Dağıtık paylaşımlı dosya sistemi. S3 uyumlu API + FUSE mount. Swarm üzerinde birden fazla volume grubu ile çalışır.',
    logo: 'https://raw.githubusercontent.com/seaweedfs/seaweedfs/master/note/SeaweedFS_logo.png',
    image: 'chrislusf/seaweedfs:latest',
    categories: ['storage', 'distributed'],
    ports: [],
    volumes: [],
    env: [
      { name: 'VOLUME_SIZE_LIMIT_MB', label: 'Volume Boyutu (MB)', default: '5120', description: 'Her volume sunucusunun max boyutu (MB). 5120=5GB, 20480=20GB' },
      { name: 'REPLICATION', label: 'Replikasyon', default: '010', description: '000=yok, 010=2 node kopya, 020=3 node kopya' },
      { name: 'MASTER_PORT', label: 'Master Port', default: '9333', description: 'Web UI ve API portu' },
      { name: 'FILER_PORT', label: 'Filer / S3 API Port', default: '8888', description: 'S3 uyumlu API ve POSIX filer portu' },
    ],
    composeContent: `version: "3.8"

# ─── SeaweedFS Dağıtık Depolama ───────────────────────────────────
# Master : metadata + koordinasyon (port 9333 → Web UI)
# Volume : veri parçaları, her node'da bir tane
# Filer  : S3 API (8888) + WebDAV (8333)
#
# Kullanım:
#   S3 endpoint : http://<host>:8888
#   WebDAV      : http://<host>:8333
#   Web UI      : http://<host>:9333
#
# Volume boyutu: -volumeSizeLimitMB ile sınırlanır
# Replikasyon  : 000=yok 010=2node 020=3node 100=farklı rack

services:
  weed-master:
    image: chrislusf/seaweedfs:latest
    command:
      - master
      - -port=9333
      - -mdir=/data
      - -defaultReplication=\${REPLICATION:-010}
    volumes:
      - weed-master-data:/data
    ports:
      - "\${MASTER_PORT:-9333}:9333"
    networks:
      - weed-net
    deploy:
      replicas: 1
      placement:
        constraints: [node.role == manager]
      restart_policy:
        condition: any
        delay: 5s

  # Volume Grubu 1 — node01 (/data/group1)
  weed-vol-g1-n1:
    image: chrislusf/seaweedfs:latest
    command:
      - volume
      - -port=8080
      - -mserver=weed-master:9333
      - -dir=/data
      - -replication=\${REPLICATION:-010}
      - -volumeSizeLimitMB=\${VOLUME_SIZE_LIMIT_MB:-5120}
      - -collection=group1
    volumes:
      - weed-vol-g1-n1:/data
    networks:
      - weed-net
    deploy:
      replicas: 1
      placement:
        constraints: [node.hostname == node01]
      restart_policy:
        condition: any

  # Volume Grubu 1 — node02 (replikasyon kopyası)
  weed-vol-g1-n2:
    image: chrislusf/seaweedfs:latest
    command:
      - volume
      - -port=8080
      - -mserver=weed-master:9333
      - -dir=/data
      - -replication=\${REPLICATION:-010}
      - -volumeSizeLimitMB=\${VOLUME_SIZE_LIMIT_MB:-5120}
      - -collection=group1
    volumes:
      - weed-vol-g1-n2:/data
    networks:
      - weed-net
    deploy:
      replicas: 1
      placement:
        constraints: [node.hostname == node02]
      restart_policy:
        condition: any

  # Volume Grubu 2 — node02 (farklı boyut, farklı klasör)
  weed-vol-g2-n2:
    image: chrislusf/seaweedfs:latest
    command:
      - volume
      - -port=8081
      - -mserver=weed-master:9333
      - -dir=/data
      - -replication=\${REPLICATION:-010}
      - -volumeSizeLimitMB=20480
      - -collection=group2
    volumes:
      - weed-vol-g2-n2:/data
    networks:
      - weed-net
    deploy:
      replicas: 1
      placement:
        constraints: [node.hostname == node02]
      restart_policy:
        condition: any

  # Volume Grubu 2 — node03 (replikasyon kopyası)
  weed-vol-g2-n3:
    image: chrislusf/seaweedfs:latest
    command:
      - volume
      - -port=8081
      - -mserver=weed-master:9333
      - -dir=/data
      - -replication=\${REPLICATION:-010}
      - -volumeSizeLimitMB=20480
      - -collection=group2
    volumes:
      - weed-vol-g2-n3:/data
    networks:
      - weed-net
    deploy:
      replicas: 1
      placement:
        constraints: [node.hostname == node03]
      restart_policy:
        condition: any

  weed-filer:
    image: chrislusf/seaweedfs:latest
    command:
      - filer
      - -port=8888
      - -master=weed-master:9333
    ports:
      - "\${FILER_PORT:-8888}:8888"
      - "8333:8333"
    networks:
      - weed-net
    deploy:
      replicas: 1
      placement:
        constraints: [node.role == manager]
      restart_policy:
        condition: any

volumes:
  weed-master-data:
  weed-vol-g1-n1:
  weed-vol-g1-n2:
  weed-vol-g2-n2:
  weed-vol-g2-n3:

networks:
  weed-net:
    driver: overlay
    attachable: true
`,
    isBuiltin: true,
    isPublic: true,
  },
];

@Injectable()
export class TemplatesService implements OnModuleInit {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectModel(Template.name) private readonly templateModel: Model<TemplateDocument>,
  ) {}

  async onModuleInit() {
    await this.seedBuiltinTemplates();
  }

  async seedBuiltinTemplates() {
    const count = await this.templateModel.countDocuments({ isBuiltin: true });
    if (count > 0) return;

    this.logger.log(`Seeding ${BUILTIN_TEMPLATES.length} built-in templates`);
    await this.templateModel.insertMany(BUILTIN_TEMPLATES);
  }

  async findAll(category?: string, search?: string) {
    const filter: any = {};
    if (category) filter.categories = category;
    if (search) filter.title = { $regex: search, $options: 'i' };
    return this.templateModel.find(filter).lean();
  }

  async findOne(id: string) {
    const template = await this.templateModel.findById(id).lean();
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    return template;
  }

  async create(dto: CreateTemplateDto) {
    const template = new this.templateModel({ ...dto, isBuiltin: false });
    return template.save();
  }

  async update(id: string, dto: UpdateTemplateDto) {
    const template = await this.templateModel.findById(id);
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    Object.assign(template, dto);
    return template.save();
  }

  async remove(id: string) {
    const template = await this.templateModel.findByIdAndDelete(id);
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    return { message: 'Template deleted' };
  }

  async getCategories(): Promise<string[]> {
    const result = await this.templateModel.distinct('categories');
    return result.filter(Boolean).sort();
  }
}
