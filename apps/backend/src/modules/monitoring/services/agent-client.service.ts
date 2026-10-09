import { Injectable, Logger } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface AgentTarget {
  nodeId: string;
  host: string;    // dns/ip
  port: number;
  token?: string;
  tls?: boolean;
}

/**
 * Shared HTTP client for talking to swarmui-agent instances. Pulls the agent
 * list from docker swarm nodes + endpoints config and fetches metric JSON
 * over the overlay network.
 */
@Injectable()
export class AgentClientService {
  private readonly logger = new Logger(AgentClientService.name);

  async fetchJson<T = any>(target: AgentTarget, path: string, timeoutMs = 8000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const url = new URL(path, `${target.tls ? 'https' : 'http'}://${target.host}:${target.port}`);
      const lib = target.tls ? https : http;
      const req = lib.request({
        hostname: url.hostname,
        port: url.port || target.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers: target.token ? { Authorization: `Bearer ${target.token}` } : {},
        timeout: timeoutMs,
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data) as T); } catch (err: any) { reject(err); }
          } else {
            reject(new Error(`agent HTTP ${res.statusCode}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('agent timeout')); });
      req.end();
    });
  }
}
