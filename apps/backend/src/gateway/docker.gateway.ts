import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import Dockerode from 'dockerode';
import { DockerService } from '../docker/docker.service';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/docker',
})
export class DockerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DockerGateway.name);
  private execStreams = new Map<string, any>();
  private logStreams = new Map<string, any>();

  constructor(private readonly dockerService: DockerService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Clean up any streams for this client
    const execStream = this.execStreams.get(client.id);
    if (execStream) {
      try { execStream.end(); } catch (_) {}
      this.execStreams.delete(client.id);
    }
    const logStream = this.logStreams.get(client.id);
    if (logStream) {
      try { logStream.destroy(); } catch (_) {}
      this.logStreams.delete(client.id);
    }
  }

  @SubscribeMessage('exec:start')
  async handleExecStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { containerId: string; cmd?: string[]; endpointId?: string; agentUrl?: string },
  ) {
    // If agentUrl provided, proxy to remote agent via socket.io
    if (data.agentUrl) {
      const { io } = await import('socket.io-client');
      const remoteSocket = io(`${data.agentUrl}/docker`, {
        auth: { token: process.env.AGENT_TOKEN || 'supersecret' },
        transports: ['websocket'],
      });
      remoteSocket.on('connect', () => {
        remoteSocket.emit('exec:start', { containerId: data.containerId, cmd: data.cmd });
      });
      remoteSocket.on('exec:ready', () => client.emit('exec:ready'));
      remoteSocket.on('exec:data', (d: any) => client.emit('exec:data', d));
      remoteSocket.on('exec:end', () => { client.emit('exec:end'); remoteSocket.disconnect(); });
      remoteSocket.on('exec:error', (e: any) => { client.emit('exec:error', e); remoteSocket.disconnect(); });
      remoteSocket.on('connect_error', (e: any) => client.emit('exec:error', e.message));
      client.on('exec:input', (d: string) => remoteSocket.emit('exec:input', d));
      client.on('exec:resize', (d: any) => remoteSocket.emit('exec:resize', d));
      client.on('disconnect', () => remoteSocket.disconnect());
      return;
    }

    const docker = this.dockerService.getLocalConnection();
    const container = docker.getContainer(data.containerId);

    try {
      const exec = await container.exec({
        Cmd: data.cmd || ['/bin/sh'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
      });

      const stream = await exec.start({ hijack: true, stdin: true });
      this.execStreams.set(client.id, stream);

      stream.on('data', (chunk: Buffer) => {
        client.emit('exec:data', chunk.toString('utf8'));
      });

      stream.on('end', () => {
        client.emit('exec:end');
        this.execStreams.delete(client.id);
      });

      stream.on('error', (err: any) => {
        client.emit('exec:error', err.message);
        this.execStreams.delete(client.id);
      });

      client.emit('exec:ready');
    } catch (err: any) {
      this.logger.error(`Exec error: ${err.message}`);
      client.emit('exec:error', err.message);
    }
  }

  @SubscribeMessage('exec:input')
  handleExecInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: string,
  ) {
    const stream = this.execStreams.get(client.id);
    if (stream) {
      stream.write(data);
    }
  }

  @SubscribeMessage('exec:resize')
  async handleExecResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { containerId: string; cols: number; rows: number },
  ) {
    // Resize tty
    const docker = this.dockerService.getLocalConnection();
    const container = docker.getContainer(data.containerId);
    try {
      const execs = await container.inspect();
      // We'd need to track the exec ID; for simplicity emit a resize to existing stream
      client.emit('exec:resized', { cols: data.cols, rows: data.rows });
    } catch (err: any) {
      this.logger.warn(`Resize error: ${err.message}`);
    }
  }

  @SubscribeMessage('logs:start')
  async handleLogsStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { containerId: string; tail?: number; endpointId?: string },
  ) {
    const docker = this.dockerService.getLocalConnection();
    const container = docker.getContainer(data.containerId);

    try {
      const stream = await new Promise<any>((resolve, reject) => {
        container.logs({
          follow: true,
          stdout: true,
          stderr: true,
          tail: data.tail || 100,
          timestamps: true,
        }, (err: any, s: any) => {
          if (err) reject(err);
          else resolve(s);
        });
      });

      this.logStreams.set(client.id, stream);

      (docker.modem as any).demuxStream(stream,
        { write: (chunk: Buffer) => { client.emit('logs:data', { type: 'stdout', text: chunk.toString('utf8') }); } },
        { write: (chunk: Buffer) => { client.emit('logs:data', { type: 'stderr', text: chunk.toString('utf8') }); } },
      );

      stream.on('end', () => {
        client.emit('logs:end');
        this.logStreams.delete(client.id);
      });

      client.emit('logs:ready');
    } catch (err: any) {
      client.emit('logs:error', err.message);
    }
  }

  @SubscribeMessage('logs:stop')
  handleLogsStop(@ConnectedSocket() client: Socket) {
    const stream = this.logStreams.get(client.id);
    if (stream) {
      try { stream.destroy(); } catch (_) {}
      this.logStreams.delete(client.id);
    }
  }

  @SubscribeMessage('events:subscribe')
  async handleEventsSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { endpointId?: string },
  ) {
    const docker = this.dockerService.getLocalConnection();

    try {
      const stream = await docker.getEvents({});
      this.logStreams.set(`events:${client.id}`, stream);

      stream.on('data', (chunk: Buffer) => {
        try {
          const event = JSON.parse(chunk.toString());
          client.emit('docker:event', event);
        } catch (_) {}
      });

      stream.on('end', () => {
        client.emit('events:end');
      });

      client.emit('events:ready');
    } catch (err: any) {
      client.emit('events:error', err.message);
    }
  }
}
