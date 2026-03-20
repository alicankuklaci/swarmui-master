import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StackWebhook } from './stack-webhook.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Dockerode from 'dockerode';
import * as yaml from 'js-yaml';
import { DockerService } from '../../../docker/docker.service';
import { StackFile } from './stack-file.schema';

export interface StackInfo {
  name: string;
  services: number;
  tasks: number;
  createdAt: string;
}

@Injectable()
export class StacksService {
  private readonly logger = new Logger(StacksService.name);

  constructor(
    private readonly dockerService: DockerService,
    @InjectModel(StackFile.name) private stackFileModel: Model<StackFile>,
    @InjectModel(StackWebhook.name) private webhookModel: Model<StackWebhook>,
  ) {}

  private getDocker(endpointId?: string): Dockerode {
    return this.dockerService.getLocalConnection();
  }

  private listServicesWithStatus(docker: Dockerode, filters?: Record<string, string[]>): Promise<any[]> {
    const opts: Record<string, any> = { status: true };
    if (filters) opts.filters = JSON.stringify(filters);
    return (docker as any).listServices(opts);
  }

  async list(endpointId?: string): Promise<StackInfo[]> {
    const docker = this.getDocker(endpointId);
    const [services, networks] = await Promise.all([
      this.listServicesWithStatus(docker),
      docker.listNetworks(),
    ]);

    const stacks = new Map<string, { serviceIds: string[]; running: number; desired: number }>();

    for (const svc of services) {
      const stackName = svc.Spec?.Labels?.['com.docker.stack.namespace'];
      if (!stackName) continue;

      if (!stacks.has(stackName)) {
        stacks.set(stackName, { serviceIds: [], running: 0, desired: 0 });
      }
      const stack = stacks.get(stackName)!;
      stack.serviceIds.push(svc.ID!);
      stack.running += (svc as any).ServiceStatus?.RunningTasks ?? 0;
      stack.desired += svc.Spec?.Mode?.Replicated?.Replicas
        ?? (svc as any).ServiceStatus?.DesiredTasks
        ?? (svc.Spec?.Mode?.Global !== undefined ? 1 : 1);
    }

    // Also discover stacks from networks (catches stacks with no running services)
    for (const net of networks) {
      const stackName = net.Labels?.['com.docker.stack.namespace'];
      if (stackName && !stacks.has(stackName)) {
        stacks.set(stackName, { serviceIds: [], running: 0, desired: 0 });
      }
    }

    const result: StackInfo[] = [];
    for (const [name, info] of stacks) {
      result.push({
        name,
        services: info.serviceIds.length,
        tasks: info.running,
        createdAt: new Date().toISOString(),
      });
    }

    return result;
  }

  async inspect(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const services = await this.listServicesWithStatus(docker, { label: [`com.docker.stack.namespace=${name}`] });
    if (services.length === 0) throw new NotFoundException(`Stack ${name} not found`);

    const serviceDetails = services.map((svc: any) => ({
      id: svc.ID,
      name: svc.Spec?.Name,
      image: svc.Spec?.TaskTemplate?.ContainerSpec?.Image?.split('@')[0] ?? '—',
      replicas: {
        running: svc.ServiceStatus?.RunningTasks ?? 0,
        desired: svc.Spec?.Mode?.Replicated?.Replicas ?? svc.ServiceStatus?.DesiredTasks ?? 1,
      },
      ports: svc.Endpoint?.Ports ?? [],
      updatedAt: svc.UpdatedAt,
    }));

    return { name, services: serviceDetails };
  }

  async getServices(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return this.listServicesWithStatus(docker, { label: [`com.docker.stack.namespace=${name}`] });
  }

  async getTasks(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.listTasks({
      filters: JSON.stringify({ label: [`com.docker.stack.namespace=${name}`] }),
    });
  }

  async deploy(name: string, composeContent: string, endpointId?: string) {
    // Store compose file in MongoDB for persistence
    await this.stackFileModel.findOneAndUpdate(
      { name },
      { content: composeContent },
      { upsert: true },
    );

    // Parse compose and deploy services
    try {
      const compose = this.parseComposeFile(composeContent);

      if (!compose.services || Object.keys(compose.services).length === 0) {
        throw new Error('No services defined in compose file');
      }

      const docker = this.getDocker(endpointId);
      const deployedServices: any[] = [];

      // Create networks first
      if (compose.networks) {
        for (const [networkName, networkConfig] of Object.entries(compose.networks || {})) {
          const netCfg: any = (networkConfig as any) || {};
          // external network'leri oluşturma — zaten var olmalı
          if (netCfg.external === true || (typeof netCfg.external === 'object' && netCfg.external !== null)) {
            this.logger.log(`Skipping external network: ${netCfg.name || networkName}`);
            continue;
          }
          const fullNetworkName = `${name}_${networkName}`;
          try {
            const existing = await docker.listNetworks({
              filters: JSON.stringify({ name: [fullNetworkName] }),
            });
            if (existing.length === 0) {
              await docker.createNetwork({
                Name: fullNetworkName,
                Driver: netCfg.driver || 'overlay',
                Attachable: netCfg.attachable === true,
                Internal: netCfg.internal === true,
                EnableIPv6: netCfg.enable_ipv6 === true,
                Labels: {
                  'com.docker.stack.namespace': name,
                  ...(netCfg.labels || {}),
                },
                Options: netCfg.driver_opts || {},
                ...(netCfg.ipam ? {
                  IPAM: {
                    Driver: netCfg.ipam.driver || 'default',
                    Config: (netCfg.ipam.config || []).map((cfg: any) => ({
                      Subnet: cfg.subnet,
                      Gateway: cfg.gateway,
                    })),
                  },
                } : {}),
              });
            } else {
              // Network var ama attachable değişmiş olabilir — update et
              const net = docker.getNetwork(existing[0].Id!);
              const info = await net.inspect();
              if (netCfg.attachable === true && !info.Attachable) {
                this.logger.warn(`Network ${fullNetworkName} exists but not attachable — recreating`);
                await net.remove().catch(() => {});
                await docker.createNetwork({
                  Name: fullNetworkName,
                  Driver: netCfg.driver || 'overlay',
                  Attachable: true,
                  Labels: { 'com.docker.stack.namespace': name },
                });
              }
            }
          } catch (err: any) {
            this.logger.warn(`Failed to create network ${fullNetworkName}: ${err.message}`);
          }
        }
      }

      for (const [serviceName, serviceConfig] of Object.entries(compose.services || {})) {
        const spec = this.buildServiceSpec(name, serviceName, serviceConfig as any, compose);
        try {
          // Check if service already exists
          const existing = await docker.listServices({
            filters: JSON.stringify({ name: [`${name}_${serviceName}`] }),
          });

          if (existing.length > 0) {
            const svc = docker.getService(existing[0].ID!);
            const current = await svc.inspect();
            const registryAuthU = this.getRegistryAuth();
            if (registryAuthU) {
              await (svc as any).update({ version: current.Version.Index, ...spec }, { authconfig: { key: registryAuthU } });
            } else {
              await svc.update({ version: current.Version.Index, ...spec });
            }
            deployedServices.push({ name: serviceName, action: 'updated' });
          } else {
            const registryAuth = this.getRegistryAuth();
            if (registryAuth) {
              await (docker as any).createService(spec, { authconfig: { key: registryAuth } });
            } else {
              await docker.createService(spec);
            }
            deployedServices.push({ name: serviceName, action: 'created' });
          }
        } catch (err: any) {
          this.logger.error(`Failed to deploy service ${serviceName}: ${err.message}`);
          deployedServices.push({ name: serviceName, action: 'failed', error: err.message });
        }
      }

      return { stack: name, services: deployedServices };
    } catch (err: any) {
      throw new BadRequestException(`Failed to deploy stack: ${err.message}`);
    }
  }

  async remove(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const services = await docker.listServices({
      filters: JSON.stringify({ label: [`com.docker.stack.namespace=${name}`] }),
    });

    if (services.length === 0) throw new NotFoundException(`Stack ${name} not found`);

    await Promise.all(services.map(svc => docker.getService(svc.ID!).remove()));

    // Also clean up stack networks
    try {
      const networks = await docker.listNetworks({
        filters: JSON.stringify({ label: [`com.docker.stack.namespace=${name}`] }),
      });
      await Promise.all(networks.map(net => docker.getNetwork(net.Id!).remove()));
    } catch (err: any) {
      this.logger.warn(`Failed to remove some networks for stack ${name}: ${err.message}`);
    }

    await this.stackFileModel.deleteOne({ name });

    return { message: `Stack ${name} removed` };
  }

  async getComposeFile(name: string, endpointId?: string): Promise<string> {
    const doc = await this.stackFileModel.findOne({ name });
    if (doc) return doc.content;

    // Fallback: reconstruct compose from live Docker services
    const docker = this.getDocker(endpointId);
    const services = await this.listServicesWithStatus(docker, {
      label: [`com.docker.stack.namespace=${name}`],
    });

    if (services.length === 0) {
      throw new NotFoundException(`Compose file for stack ${name} not found`);
    }

    const composeDef: Record<string, any> = {};
    for (const svc of services) {
      const spec = svc.Spec ?? {};
      const containerSpec = spec.TaskTemplate?.ContainerSpec ?? {};
      const svcName = (spec.Name ?? '').replace(`${name}_`, '') || spec.Name;

      const serviceDef: Record<string, any> = {
        image: containerSpec.Image?.split('@')[0] ?? 'unknown',
      };

      // Ports
      const ports = svc.Endpoint?.Ports ?? [];
      if (ports.length > 0) {
        serviceDef.ports = ports.map(
          (p: any) => `${p.PublishedPort}:${p.TargetPort}/${p.Protocol ?? 'tcp'}`,
        );
      }

      // Environment
      const env = containerSpec.Env;
      if (env && env.length > 0) {
        serviceDef.environment = env;
      }

      // Volumes / Mounts
      const mounts = containerSpec.Mounts ?? [];
      if (mounts.length > 0) {
        serviceDef.volumes = mounts.map(
          (m: any) => `${m.Source}:${m.Target}${m.ReadOnly ? ':ro' : ''}`,
        );
      }

      // Replicas
      const replicas = spec.Mode?.Replicated?.Replicas;
      if (replicas !== undefined && replicas !== 1) {
        serviceDef.deploy = { replicas };
      }

      composeDef[svcName] = serviceDef;
    }

    return yaml.dump(
      { version: '3.8', services: composeDef },
      { lineWidth: 120, noRefs: true },
    );
  }

  private parseComposeFile(content: string): any {
    // Try JSON first
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Not JSON, try YAML
    }

    // Parse YAML
    try {
      const parsed = yaml.load(content) as any;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid compose file format');
      }
      return parsed;
    } catch (err: any) {
      throw new Error(`Invalid compose file: ${err.message}`);
    }
  }

private parseDuration(d: string): number {
    if (!d) return 5000000000;
    const s = String(d).trim();
    const n = parseFloat(s);
    if (s.endsWith('ns')) return n;
    if (s.endsWith('us') || s.endsWith('µs')) return n * 1_000;
    if (s.endsWith('ms')) return n * 1_000_000;
    if (s.endsWith('m'))  return n * 60_000_000_000;
    if (s.endsWith('h'))  return n * 3_600_000_000_000;
    // default: seconds
    return n * 1_000_000_000;
  }

  private parseMemory(m: string | number): number {
    if (typeof m === 'number') return m;
    const s = String(m).trim().toLowerCase();
    const n = parseFloat(s);
    if (s.endsWith('g') || s.endsWith('gb')) return Math.round(n * 1024 * 1024 * 1024);
    if (s.endsWith('m') || s.endsWith('mb')) return Math.round(n * 1024 * 1024);
    if (s.endsWith('k') || s.endsWith('kb')) return Math.round(n * 1024);
    return n;
  }

  private parsePorts(ports: any[]): any[] {
    const result: any[] = [];
    for (const p of ports || []) {
      if (typeof p === 'string' || typeof p === 'number') {
        const str = String(p);
        // format: [host:]container[/proto]
        const protoSplit = str.split('/');
        const proto = (protoSplit[1] || 'tcp').toLowerCase();
        const parts = protoSplit[0].split(':');
        const target = parseInt(parts[parts.length - 1]);
        const published = parts.length > 1 ? parseInt(parts[parts.length - 2]) : 0;
        if (target) result.push({ Protocol: proto, TargetPort: target, PublishedPort: published || undefined });
      } else if (typeof p === 'object') {
        // long format: { target, published, protocol, mode }
        result.push({
          Protocol: (p.protocol || 'tcp').toLowerCase(),
          TargetPort: parseInt(p.target),
          PublishedPort: p.published ? parseInt(p.published) : undefined,
          PublishMode: p.mode || 'ingress',
        });
      }
    }
    return result;
  }

  private buildServiceSpec(stackName: string, serviceName: string, config: any, compose: any): any {
    const fullName = `${stackName}_${serviceName}`;
    const deploy = config.deploy || {};

    // ── ContainerSpec ────────────────────────────────────────────────
    const containerSpec: any = {
      Image: config.image || 'alpine',
      Labels: {
        'com.docker.stack.namespace': stackName,
        ...(config.labels
          ? Array.isArray(config.labels)
            ? Object.fromEntries(config.labels.map((l: string) => l.split('=')))
            : config.labels
          : {}),
      },
      Env: Array.isArray(config.environment)
        ? config.environment
        : Object.entries(config.environment || {}).map(([k, v]) => `${k}=${v}`),
    };

    if (config.command !== undefined)
      containerSpec.Args = Array.isArray(config.command) ? config.command.map(String) : String(config.command).trim().split(/\s+/);

    if (config.entrypoint !== undefined)
      containerSpec.Command = Array.isArray(config.entrypoint) ? config.entrypoint.map(String) : String(config.entrypoint).trim().split(/\s+/);

    if (config.user)        containerSpec.User    = String(config.user);
    if (config.working_dir) containerSpec.Dir     = String(config.working_dir);
    if (config.hostname)    containerSpec.Hostname = String(config.hostname);
    if (config.stop_grace_period) containerSpec.StopGracePeriod = this.parseDuration(config.stop_grace_period);
    if (config.stop_signal) containerSpec.StopSignal = String(config.stop_signal);
    if (config.read_only)   containerSpec.ReadOnly = true;
    if (config.init)        containerSpec.Init = true;
    if (config.tty)         containerSpec.TTY = true;
    if (config.stdin_open)  containerSpec.OpenStdin = true;

    // Volumes
    if (config.volumes?.length) {
      containerSpec.Mounts = config.volumes.map((v: any) => {
        if (typeof v === 'string') {
          const parts = v.split(':');
          const source = parts.length > 1 ? parts[0] : undefined;
          const target = parts.length > 1 ? parts[1] : parts[0];
          const readonly = parts[2] === 'ro';
          const isNamed = source && !source.startsWith('/') && !source.startsWith('.');
          return {
            Type: isNamed ? 'volume' : source ? 'bind' : 'volume',
            Source: source || '',
            Target: target.split(':')[0],
            ReadOnly: readonly,
          };
        }
        return {
          Type: v.type || 'volume',
          Source: v.source || '',
          Target: v.target,
          ReadOnly: v.read_only || false,
          ...(v.bind?.propagation ? { BindOptions: { Propagation: v.bind.propagation } } : {}),
          ...(v.volume?.nocopy ? { VolumeOptions: { NoCopy: true } } : {}),
          ...(v.tmpfs?.size ? { TmpfsOptions: { SizeBytes: this.parseMemory(v.tmpfs.size) } } : {}),
        };
      });
    }

    // Capabilities
    if (config.cap_add?.length)  containerSpec.CapabilityAdd  = config.cap_add;
    if (config.cap_drop?.length) containerSpec.CapabilityDrop = config.cap_drop;

    // Security opt
    if (config.security_opt?.length) containerSpec.SecurityOpt = config.security_opt;

    // Devices
    if (config.devices?.length) containerSpec.Devices = config.devices;

    // ulimits
    if (config.ulimits) {
      containerSpec.Ulimits = Object.entries(config.ulimits).map(([name, val]: [string, any]) => ({
        Name: name,
        Soft: typeof val === 'object' ? val.soft : val,
        Hard: typeof val === 'object' ? val.hard : val,
      }));
    }

    // Healthcheck
    if (config.healthcheck && !config.healthcheck.disable) {
      const hc = config.healthcheck;
      containerSpec.Healthcheck = {
        ...(hc.test ? { Test: Array.isArray(hc.test) ? hc.test : ['CMD-SHELL', hc.test] } : {}),
        ...(hc.interval  ? { Interval:    this.parseDuration(hc.interval)  } : {}),
        ...(hc.timeout   ? { Timeout:     this.parseDuration(hc.timeout)   } : {}),
        ...(hc.start_period ? { StartPeriod: this.parseDuration(hc.start_period) } : {}),
        ...(hc.retries   ? { Retries:     hc.retries     } : {}),
      };
    } else if (config.healthcheck?.disable) {
      containerSpec.Healthcheck = { Test: ['NONE'] };
    }

    // DNS
    if (config.dns)        containerSpec.DNSConfig = { Nameservers: Array.isArray(config.dns) ? config.dns : [config.dns] };
    if (config.dns_search) containerSpec.DNSConfig = { ...containerSpec.DNSConfig, Search: Array.isArray(config.dns_search) ? config.dns_search : [config.dns_search] };

    // Extra hosts
    if (config.extra_hosts?.length)
      containerSpec.Hosts = (Array.isArray(config.extra_hosts) ? config.extra_hosts : Object.entries(config.extra_hosts).map(([h, ip]) => `${ip} ${h}`));

    // Logging
    if (config.logging) {
      containerSpec.LogDriver = {
        Name: config.logging.driver || 'json-file',
        Options: config.logging.options || {},
      };
    }

    // Secrets
    if (config.secrets?.length) {
      containerSpec.Secrets = config.secrets.map((s: any) => typeof s === 'string'
        ? { SecretName: s, File: { Name: `/run/secrets/${s}`, UID: '0', GID: '0', Mode: 0o444 } }
        : { SecretName: s.source || s.secret, File: { Name: s.target || `/run/secrets/${s.source || s.secret}`, UID: String(s.uid || 0), GID: String(s.gid || 0), Mode: s.mode || 0o444 } }
      );
    }

    // Configs
    if (config.configs?.length) {
      containerSpec.Configs = config.configs.map((c: any) => typeof c === 'string'
        ? { ConfigName: c, File: { Name: `/${c}`, UID: '0', GID: '0', Mode: 0o444 } }
        : { ConfigName: c.source || c.config, File: { Name: c.target || `/${c.source}`, UID: String(c.uid || 0), GID: String(c.gid || 0), Mode: c.mode || 0o444 } }
      );
    }

    // ── Resources ────────────────────────────────────────────────────
    const resources: any = {};
    if (deploy.resources?.limits) {
      resources.Limits = {};
      if (deploy.resources.limits.cpus)   resources.Limits.NanoCPUs  = Math.round(parseFloat(deploy.resources.limits.cpus) * 1e9);
      if (deploy.resources.limits.memory) resources.Limits.MemoryBytes = this.parseMemory(deploy.resources.limits.memory);
    }
    if (deploy.resources?.reservations) {
      resources.Reservations = {};
      if (deploy.resources.reservations.cpus)   resources.Reservations.NanoCPUs    = Math.round(parseFloat(deploy.resources.reservations.cpus) * 1e9);
      if (deploy.resources.reservations.memory) resources.Reservations.MemoryBytes = this.parseMemory(deploy.resources.reservations.memory);
    }

    // ── RestartPolicy ────────────────────────────────────────────────
    const rp = deploy.restart_policy || {};
    const restartPolicy: any = {
      Condition: rp.condition || 'on-failure',
      Delay:       rp.delay       ? this.parseDuration(rp.delay)       : 5_000_000_000,
      MaxAttempts: rp.max_attempts ?? 3,
      Window:      rp.window      ? this.parseDuration(rp.window)      : 0,
    };

    // ── Placement ────────────────────────────────────────────────────
    const placement: any = {};
    if (deploy.placement?.constraints?.length)
      placement.Constraints = Array.isArray(deploy.placement.constraints)
        ? deploy.placement.constraints : [deploy.placement.constraints];
    if (deploy.placement?.preferences?.length)
      placement.Preferences = deploy.placement.preferences.map((p: any) => ({ Spread: { SpreadDescriptor: p.spread } }));
    if (deploy.placement?.max_replicas_per_node)
      placement.MaxReplicas = deploy.placement.max_replicas_per_node;

    // ── UpdateConfig ─────────────────────────────────────────────────
    const updateConfig: any = {};
    if (deploy.update_config) {
      const uc = deploy.update_config;
      if (uc.parallelism !== undefined) updateConfig.Parallelism  = uc.parallelism;
      if (uc.delay)       updateConfig.Delay       = this.parseDuration(uc.delay);
      if (uc.order)       updateConfig.Order       = uc.order;
      if (uc.failure_action) updateConfig.FailureAction = uc.failure_action;
      if (uc.monitor)     updateConfig.Monitor     = this.parseDuration(uc.monitor);
      if (uc.max_failure_ratio !== undefined) updateConfig.MaxFailureRatio = uc.max_failure_ratio;
    }

    // ── RollbackConfig ───────────────────────────────────────────────
    const rollbackConfig: any = {};
    if (deploy.rollback_config) {
      const rc = deploy.rollback_config;
      if (rc.parallelism !== undefined) rollbackConfig.Parallelism = rc.parallelism;
      if (rc.delay)       rollbackConfig.Delay       = this.parseDuration(rc.delay);
      if (rc.order)       rollbackConfig.Order       = rc.order;
      if (rc.failure_action) rollbackConfig.FailureAction = rc.failure_action;
      if (rc.monitor)     rollbackConfig.Monitor     = this.parseDuration(rc.monitor);
      if (rc.max_failure_ratio !== undefined) rollbackConfig.MaxFailureRatio = rc.max_failure_ratio;
    }

    // ── Networks ─────────────────────────────────────────────────────
    const networks = (Array.isArray(config.networks) ? config.networks : Object.keys(config.networks || {}))
      .map((n: any) => {
        const netName = typeof n === 'string' ? n : Object.keys(n)[0];
        // service-level network config (aliases vb.)
        const svcNetCfg = typeof n === 'object' ? Object.values(n)[0] as any : {};
        // compose-level network config (external, driver, name vb.)
        const topNetCfg = compose.networks?.[netName] || {};
        const isExternal = topNetCfg.external === true ||
          (typeof topNetCfg.external === 'object' && topNetCfg.external !== null);
        // external ise: name: alanını kullan, yoksa netName'i olduğu gibi kullan
        const target = isExternal
          ? (topNetCfg.name || netName)
          : `${stackName}_${netName}`;
        const net: any = { Target: target };
        if (svcNetCfg?.aliases?.length) net.Aliases = svcNetCfg.aliases;
        return net;
      });

    // ── Ports ────────────────────────────────────────────────────────
    const ports = this.parsePorts(config.ports || []);

    // ── Mode ─────────────────────────────────────────────────────────
    const mode = deploy.mode === 'global'
      ? { Global: {} }
      : { Replicated: { Replicas: deploy.replicas ?? 1 } };

    // ── Assemble ─────────────────────────────────────────────────────
    const spec: any = {
      Name: fullName,
      Labels: {
        'com.docker.stack.namespace': stackName,
        'com.docker.stack.image': config.image || '',
      },
      TaskTemplate: {
        ContainerSpec: containerSpec,
        RestartPolicy: restartPolicy,
        ...(Object.keys(resources).length ? { Resources: resources } : {}),
        ...(Object.keys(placement).length ? { Placement: placement } : {}),
        Networks: networks,
        Runtime: 'container',
      },
      Mode: mode,
      Networks: networks,
      EndpointSpec: { Ports: ports },
      ...(Object.keys(updateConfig).length  ? { UpdateConfig:   updateConfig  } : {}),
      ...(Object.keys(rollbackConfig).length ? { RollbackConfig: rollbackConfig } : {}),
    };

    return spec;
  }

  async update(name: string, composeContent: string, endpointId?: string) {
    return this.deploy(name, composeContent, endpointId);
  }

  // ─── Env Vars ────────────────────────────────────────────────────────────────

  async getEnvVars(name: string): Promise<{ key: string; value: string }[]> {
    const doc = await this.stackFileModel.findOne({ name });
    return doc?.envVars ?? [];
  }

  async saveEnvVars(name: string, envVars: { key: string; value: string }[]): Promise<void> {
    await this.stackFileModel.findOneAndUpdate(
      { name },
      { envVars },
      { upsert: true },
    );
  }

    // ─── Registry Auth ──────────────────────────────────────────────────────────

  private getRegistryAuth(): string {
    try {
      const configPath = require('path').join(
        process.env.HOME || '/root',
        '.docker', 'config.json'
      );
      const config = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
      const auths = config.auths || {};
      // docker.io veya index.docker.io
      const entry = auths['https://index.docker.io/v1/'] || auths['https://registry-1.docker.io/v2/'] || Object.values(auths)[0];
      if (entry && (entry as any).auth) {
        return Buffer.from(JSON.stringify({
          identitytoken: '',
          auth: (entry as any).auth,
        })).toString('base64');
      }
    } catch { /* no auth config */ }
    return '';
  }


  // ─── Webhook Methods ────────────────────────────────────────────────────────

  async generateWebhook(stackName: string, endpointId: string, createdBy: string) {
    await this.webhookModel.deleteMany({ stackName, endpointId });
    const webhook = await this.webhookModel.create({
      token: randomUUID(),
      stackName,
      endpointId,
      createdBy,
    });
    return { token: webhook.token };
  }

  async revokeWebhook(stackName: string, endpointId: string) {
    await this.webhookModel.deleteMany({ stackName, endpointId });
    return { success: true };
  }

  async getWebhook(stackName: string, endpointId: string) {
    const wh = await this.webhookModel.findOne({ stackName, endpointId });
    if (!wh) return null;
    return {
      token: wh.token,
      createdBy: wh.createdBy,
      createdAt: (wh as any).createdAt,
    };
  }

  async triggerWebhook(token: string) {
    const wh = await this.webhookModel.findOne({ token });
    if (!wh) throw new NotFoundException('Webhook token not found');
    const docker = this.getDocker(wh.endpointId);
    const services = await (docker as any).listServices({
      filters: JSON.stringify({ label: [`com.docker.stack.namespace=${wh.stackName}`] }),
    });
    if (!services.length) {
      throw new NotFoundException(`Stack "${wh.stackName}" not found or has no services`);
    }
    const updated: string[] = [];
    for (const svcInfo of services) {
      const svc = docker.getService(svcInfo.ID);
      const inspect = await svc.inspect();
      const spec = JSON.parse(JSON.stringify(inspect.Spec));
      spec.TaskTemplate = spec.TaskTemplate || {};
      spec.TaskTemplate.ForceUpdate = (spec.TaskTemplate.ForceUpdate || 0) + 1;
      await svc.update({ version: inspect.Version.Index, ...spec });
      updated.push(svcInfo.Spec?.Name || svcInfo.ID);
    }
    return { success: true, stack: wh.stackName, updatedServices: updated };
  }

}
