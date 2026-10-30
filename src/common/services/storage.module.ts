import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3StorageService } from './s3-storage.service';
import { STORAGE_SERVICE } from './storage.interface';

@Module({
  imports: [ConfigModule],
  providers: [S3StorageService, { provide: STORAGE_SERVICE, useExisting: S3StorageService }],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
