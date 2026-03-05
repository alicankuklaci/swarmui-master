import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import Dockerode from 'dockerode';
import { DockerService } from '../../docker/docker.service';

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(private readonly dockerService: DockerService) {}

  private getDocker(endpointId?: string): Dockerode {
    return this.dockerService.getLocalConnection();
  }

  async list(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.listImages({ all: false });
  }

  async inspect(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const image = docker.getImage(id);
    try {
      return await image.inspect();
    } catch (err: any) {
      throw new NotFoundException(`Image ${id} not found`);
    }
  }

  async history(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const image = docker.getImage(id);
    try {
      return await image.history();
    } catch (err: any) {
      throw new NotFoundException(`Image ${id} not found`);
    }
  }

  pull(fromImage: string, tag = 'latest', endpointId?: string): Observable<MessageEvent> {
    const docker = this.getDocker(endpointId);
    const subject = new Subject<MessageEvent>();

    docker.pull(`${fromImage}:${tag}`, (err: any, stream: any) => {
      if (err) {
        subject.error(err);
        return;
      }

      docker.modem.followProgress(
        stream,
        (err: any, output: any) => {
          if (err) subject.error(err);
          else {
            subject.next({ data: { status: 'complete', output } } as MessageEvent);
            subject.complete();
          }
        },
        (event: any) => {
          subject.next({ data: event } as MessageEvent);
        },
      );
    });

    return subject.asObservable();
  }

  async tag(id: string, repo: string, tag: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const image = docker.getImage(id);
    await image.tag({ repo, tag });
    return { message: 'Image tagged' };
  }

  async remove(id: string, force = false, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const image = docker.getImage(id);
    try {
      await image.remove({ force });
      return { message: 'Image removed' };
    } catch (err: any) {
      throw new NotFoundException(`Image ${id} not found or in use`);
    }
  }

  async prune(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.pruneImages();
  }

  async search(term: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.searchImages({ term });
  }

  async checkUpdate(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const image = docker.getImage(id);
    const info = await image.inspect();
    const repoTags = info.RepoTags || [];
    if (repoTags.length === 0 || repoTags[0] === '<none>:<none>') {
      return { hasUpdate: false, reason: 'No repo tag' };
    }

    const repoTag = repoTags[0];
    const [fullRepo, tag] = repoTag.includes(':')
      ? [repoTag.substring(0, repoTag.lastIndexOf(':')), repoTag.substring(repoTag.lastIndexOf(':') + 1)]
      : [repoTag, 'latest'];

    // Only check Docker Hub (library or user repos)
    const repo = fullRepo.includes('/') ? fullRepo : `library/${fullRepo}`;
    const currentDigest = (info.RepoDigests || [])[0]?.split('@')[1] || '';

    try {
      const https = await import('https');
      const data: string = await new Promise((resolve, reject) => {
        const url = `https://hub.docker.com/v2/repositories/${repo}/tags/${tag}`;
        https.get(url, { timeout: 5000 }, (res: any) => {
          let body = '';
          res.on('data', (c: any) => { body += c; });
          res.on('end', () => resolve(body));
          res.on('error', reject);
        }).on('error', reject);
      });
      const parsed = JSON.parse(data);
      const latestDigest = parsed.images?.[0]?.digest || parsed.digest || '';
      const hasUpdate = !!(latestDigest && currentDigest && latestDigest !== currentDigest);
      return { hasUpdate, currentDigest: currentDigest.slice(0, 16), latestDigest: latestDigest.slice(0, 16), tag };
    } catch (err: any) {
      return { hasUpdate: false, reason: 'Check failed: ' + err.message };
    }
  }
}
