import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const ALLOWED_OCR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

const MAX_OCR_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Shared Multer options for every OCR/document upload endpoint (image or PDF, 10MB max). */
export const ocrUploadInterceptorOptions: MulterOptions = {
  limits: { fileSize: MAX_OCR_UPLOAD_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_OCR_MIME_TYPES.has(file.mimetype)) {
      callback(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
      return;
    }
    callback(null, true);
  },
};
