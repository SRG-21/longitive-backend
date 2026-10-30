import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { TenantContextInterceptor } from './common/interceptors';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import aiConfig from './config/ai.config';
import storageConfig from './config/storage.config';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UserModule } from './modules/user/user.module';
import { BodyCompositionModule } from './modules/body-composition/body-composition.module';
import { OcrModule } from './modules/ocr/ocr.module';
import { LabReportsModule } from './modules/lab-reports/lab-reports.module';
import { AiModule } from './modules/ai/ai.module';
import { HealthChartModule } from './modules/health-chart/health-chart.module';
import { ExerciseModule } from './modules/exercise/exercise.module';
import { ProgressModule } from './modules/progress/progress.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SleepModule } from './modules/sleep/sleep.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { JourneyTrackerModule } from './modules/journey-tracker/journey-tracker.module';
import { AppController } from './app.controller';

// eco = Vercel serverless (no Redis, no long-lived process for Bull to run in).
// pro = long-running server; Bull queues become available for background job processing.
const isProMode = process.env.APP_MODE === 'pro';

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, aiConfig, storageConfig],
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    ...(isProMode
      ? [
          BullModule.forRoot({
            redis: {
              host: process.env.REDIS_HOST || 'localhost',
              port: parseInt(process.env.REDIS_PORT || '6379', 10),
              password: process.env.REDIS_PASSWORD || undefined,
            },
          }),
        ]
      : []),
    AuthModule,
    TenantModule,
    UserModule,
    BodyCompositionModule,
    OcrModule,
    LabReportsModule,
    AiModule,
    HealthChartModule,
    ExerciseModule,
    ProgressModule,
    InventoryModule,
    SleepModule,
    NotificationsModule,
    AnalyticsModule,
    JourneyTrackerModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
