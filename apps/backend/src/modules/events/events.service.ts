import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import Dockerode from 'dockerode';
import { DockerService } from '../../docker/docker.service';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly dockerService: DockerService) {}

  private getDocker(endpointId?: string): Dockerode {
    return this.dockerService.getLocalConnection();
  }

  async listEvents(endpointId?: string, filters?: any, limit = 100): Promise<any[]> {
    const docker = this.getDocker(endpointId);
    const since = Math.floor(Date.now() / 1000) - 86400; // last 24h
    const until = Math.floor(Date.now() / 1000);

    return new Promise((resolve, reject) => {
      const opts: any = { since, until };
      if (filters) opts.filters = JSON.stringify(filters);

      docker.getEvents(opts, (err: any, stream: any) => {
        if (err) return reject(err);
        if (!stream) return resolve([]);

        const events: any[] = [];
        let buffer = '';

        stream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              events.push(JSON.parse(line));
            } catch (_) {}
          }
        });

        stream.on('end', () => {
          if (buffer.trim()) {
            try { events.push(JSON.parse(buffer)); } catch (_) {}
          }
          resolve(events.slice(-limit).reverse());
        });

        stream.on('error', (e: any) => reject(e));

        // Safety timeout
        setTimeout(() => {
          try { stream.destroy(); } catch (_) {}
        }, 10000);
      });
    });
  }

  streamEvents(endpointId?: string, filters?: any): Observable<MessageEvent> {
    const docker = this.getDocker(endpointId);
    const subject = new Subject<MessageEvent>();

    const opts: any = { since: Math.floor(Date.now() / 1000) };
    if (filters) opts.filters = JSON.stringify(filters);

    docker.getEvents(opts, (err: any, stream: any) => {
      if (err) {
        subject.error(err);
        return;
      }
      if (!stream) {
        subject.complete();
        return;
      }

      stream.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            subject.next({ data: event } as MessageEvent);
          } catch (_) {}
        }
      });

      stream.on('end', () => subject.complete());
      stream.on('error', (e: any) => subject.error(e));
    });

    return subject.asObservable();
  }
}
