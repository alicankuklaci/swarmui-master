import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'ldapts';

@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);

  async authenticate(settings: any, username: string, password: string): Promise<{ dn: string; email?: string; username: string } | null> {
    const { url, bindDn, bindPassword, searchBase, searchFilter, usernameAttribute, emailAttribute } = settings.ldap || {};
    if (!url || !searchBase) throw new Error('LDAP config incomplete');

    const client = new Client({ url, tlsOptions: { rejectUnauthorized: false } });
    try {
      // Bind with service account
      await client.bind(bindDn || '', bindPassword || '');
      // Search for user
      const filter = (searchFilter || '(uid={{username}})').replace('{{username}}', username.replace(/[()\\/*\x00]/g, ''));
      const { searchEntries } = await client.search(searchBase, { filter, scope: 'sub', attributes: [usernameAttribute || 'uid', emailAttribute || 'mail', 'dn'] });
      if (!searchEntries.length) return null;
      const entry = searchEntries[0];
      const userDn = entry.dn;
      // Bind as user to verify password
      await client.unbind();
      const userClient = new Client({ url, tlsOptions: { rejectUnauthorized: false } });
      try {
        await userClient.bind(userDn, password);
        await userClient.unbind();
        return {
          dn: userDn,
          email: entry[emailAttribute || 'mail'] as string,
          username: (entry[usernameAttribute || 'uid'] as string) || username,
        };
      } catch { return null; }
    } catch (e) {
      this.logger.error('LDAP auth error:', (e as any).message);
      throw e;
    } finally {
      try { await client.unbind(); } catch {}
    }
  }
}
