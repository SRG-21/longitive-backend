import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression = require('compression');
import cookieParser = require('cookie-parser');

/** Shared Express/Nest setup used by both the pro-mode long-running server (main.ts) and the eco-mode Vercel handler (api/index.ts). */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: true,
    credentials: true,
  });

  // OAuth/MCP discovery documents must live at the site root (RFC 8414 / RFC 9728).
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: '.well-known/(.*)', method: RequestMethod.GET }],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Longevity Management System')
    .setDescription('API for managing health, longevity, and wellness data')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-Tenant-ID', in: 'header' }, 'tenant')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
