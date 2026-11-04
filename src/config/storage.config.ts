import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  s3: {
    region: process.env.AWS_S3_REGION || 'ap-south-1',
    bucket: process.env.AWS_S3_BUCKET || '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    // Optional: an S3-compatible endpoint (MinIO, LocalStack…). Leave empty for AWS.
    endpoint: process.env.AWS_S3_ENDPOINT || '',
  },
}));
