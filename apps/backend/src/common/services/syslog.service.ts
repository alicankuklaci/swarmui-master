import { Injectable, Logger } from '@nestjs/common';
import * as dgram from 'dgram';
import * as net from 'net';

@Injectable()
export class SyslogService {
  private readonly logger = new Logger(SyslogService.name);

  async send(host: string, port: number, protocol: 'udp' | 'tcp' = 'udp', message: string): Promise<void> {
    const priority = 134; // local0.info
    const version = 1;
    const timestamp = new Date().toISOString();
    const msg = `<${priority}>${version} ${timestamp} swarmui audit - - - ${message}`;

    return new Promise((resolve, reject) => {
      if (protocol === 'udp') {
        const client = dgram.createSocket('udp4');
        const buf = Buffer.from(msg);
        client.send(buf, port, host, (err) => {
          client.close();
          if (err) reject(err); else resolve();
        });
      } else {
        const socket = net.createConnection({ host, port }, () => {
          socket.write(msg + '\n', () => { socket.destroy(); resolve(); });
        });
        socket.on('error', reject);
        socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('timeout')); });
      }
    });
  }
}
