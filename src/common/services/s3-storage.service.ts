import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { StorageService, UploadResult } from './storage.interface';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private client: S3Client;
  private bucket: string;
  private region: string;

  constructor(private configService: ConfigService) {
    this.region = this.configService.get<string>('storage.s3.region')!;
    this.bucket = this.configService.get<string>('storage.s3.bucket')!;

    const endpoint = this.configService.get<string>('storage.s3.endpoint') || undefined;
    this.client = new S3Client({
      region: this.region,
      // S3-compatible stores generally need path-style URLs (http://host/bucket/key).
      ...(endpoint && { endpoint, forcePathStyle: true }),
      credentials: {
        accessKeyId: this.configService.get<string>('storage.s3.accessKeyId')!,
        secretAccessKey: this.configService.get<string>('storage.s3.secretAccessKey')!,
      },
    });
  }

  async upload(
    buffer: Buffer,
    filename: string,
    folder = 'general',
    contentType = 'application/octet-stream',
  ): Promise<UploadResult> {
    return this.putObject(`${folder}/${Date.now()}-${filename}`, buffer, contentType);
  }

  async putObject(
    key: string,
    buffer: Buffer,
    contentType = 'application/octet-stream',
  ): Promise<UploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    this.logger.log(`Uploaded to S3: ${key}`);
    return { key, url: this.getPublicUrl(key) };
  }

  async getFile(key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  getPublicUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async getPresignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
