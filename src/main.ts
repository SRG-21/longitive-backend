import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Application running on port ${port} (APP_MODE=${process.env.APP_MODE || 'eco'})`);
  console.log(`📚 Swagger docs at http://localhost:${port}/docs`);
}
bootstrap();
