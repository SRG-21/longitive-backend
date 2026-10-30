import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

// Vercel keeps the container warm between invocations, so the Nest app is built once
// (module scope) and reused — re-bootstrapping Nest on every request would be far too
// slow. No app.listen() here: Vercel's Node runtime invokes the exported handler
// directly with (req, res), which an Express app already satisfies.
const expressApp = express();
let appPromise: Promise<unknown> | null = null;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
  configureApp(app);
  await app.init();
  return app;
}

export default async function handler(req: express.Request, res: express.Response) {
  if (!appPromise) {
    appPromise = bootstrap();
  }
  await appPromise;
  expressApp(req, res);
}
