import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';

@Injectable()
export class S3BackupService {
  private readonly logger = new Logger(S3BackupService.name);
  private s3Client: any = null;

  constructor(private readonly config: ConfigService) {
    this.initS3();
  }

  private async initS3() {
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn('AWS credentials not configured, S3 backup disabled');
      return;
    }
    try {
      const { S3Client } = await import('@aws-sdk/client-s3');
      this.s3Client = new S3Client({
        region: this.config.get<string>('AWS_REGION', 'us-east-1'),
        credentials: { accessKeyId, secretAccessKey },
        endpoint: this.config.get<string>('S3_ENDPOINT'),
      });
    } catch (err: any) {
      this.logger.error(`S3 init failed: ${err.message}`);
    }
  }

  async uploadFile(filePath: string, bucket: string, key: string): Promise<string> {
    if (!this.s3Client) throw new Error('S3 not configured');
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const fileStream = fs.createReadStream(filePath);
    await this.s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: fileStream }));
    return `s3://${bucket}/${key}`;
  }

  async listObjects(bucket: string, prefix?: string): Promise<any[]> {
    if (!this.s3Client) return [];
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const res = await this.s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    return res.Contents || [];
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    if (!this.s3Client) return;
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await this.s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  isConfigured(): boolean {
    return this.s3Client !== null;
  }
}
