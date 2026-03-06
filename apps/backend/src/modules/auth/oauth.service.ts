import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import * as querystring from 'querystring';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  private async httpPost(url: string, body: Record<string,string>, headers: Record<string,string> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const data = querystring.stringify(body);
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request({ hostname: u.hostname, port: u.port || (u.protocol==='https:'?443:80), path: u.pathname+u.search, method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data), 'Accept': 'application/json', ...headers }
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(body); } });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  private async httpGet(url: string, headers: Record<string,string> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      lib.get({ hostname: u.hostname, port: u.port, path: u.pathname+u.search, headers: { 'Accept': 'application/json', ...headers } }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(body); } });
      }).on('error', reject);
    });
  }

  getAuthorizationUrl(settings: any): string {
    const cfg = settings.oauth || {};
    if (!cfg.authorizationUrl || !cfg.clientId) throw new Error('OAuth config incomplete');
    const params = new URLSearchParams({
      client_id: cfg.clientId, redirect_uri: cfg.redirectUri || '',
      response_type: 'code', scope: cfg.scopes || 'openid email profile',
      state: Math.random().toString(36).slice(2),
    });
    return `${cfg.authorizationUrl}?${params.toString()}`;
  }

  async exchangeCode(settings: any, code: string): Promise<{ email: string; username: string; name?: string }> {
    const cfg = settings.oauth || {};
    if (!cfg.tokenUrl || !cfg.clientId || !cfg.clientSecret) throw new Error('OAuth config incomplete');
    const tokenData = await this.httpPost(cfg.tokenUrl, {
      grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri || '',
      client_id: cfg.clientId, client_secret: cfg.clientSecret,
    });
    if (!tokenData.access_token) throw new Error('No access token received');
    const u = await this.httpGet(cfg.userInfoUrl, { Authorization: `Bearer ${tokenData.access_token}` });
    const email = u.email || u.mail || u.preferred_username || '';
    const username = u.login || u.preferred_username || u.name || email.split('@')[0];
    return { email, username, name: u.name };
  }
}
