export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface UploadResult {
  key: string;
  url: string;
}

export interface StorageService {
  upload(buffer: Buffer, filename: string, folder?: string, contentType?: string): Promise<UploadResult>;
  getFile(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
  /** A time-limited fetchable URL for the object — Mistral OCR needs this (it fetches the document itself, doesn't accept a buffer). */
  getPresignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}
