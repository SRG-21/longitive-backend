import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { tenantContext } from '../common/context/tenant-context';

/** Model delegate property names (as exposed on PrismaClient) that carry a tenantId field. */
const TENANT_SCOPED_MODELS = new Set<Prisma.ModelName>([
  'User',
  'EmergencyContact',
  'MedicalCondition',
  'FamilyHistory',
  'Treatment',
  'LifestyleProfile',
  'BodyComposition',
  'LabReport',
  'LabTestResult',
  'AiChatSession',
  'AiChatMessage',
  'AiInsight',
  'HealthIncident',
  'DietPlan',
  'SupplementPlan',
  'HydrationPlan',
  'DailyChart',
  'ExercisePlan',
  'ExerciseLog',
  'DailyChecklist',
  'ProgressStreak',
  'InventoryItem',
  'InventoryLog',
  'SleepLog',
  'MoodLog',
  'NotificationPreference',
  'ScheduledReminder',
  'JourneyTracker',
  'TrackerField',
  'TrackerEntry',
  'TelegramLink',
  'TelegramAlertLog',
  'JourneyReview',
  'OAuthAuthorizationCode',
  'OAuthGrant',
]);

/** Every model delegate name (tenant-scoped or not) that must resolve against the extended client. */
const ALL_MODEL_DELEGATES = [
  'tenant',
  'user',
  'emergencyContact',
  'medicalCondition',
  'familyHistory',
  'treatment',
  'lifestyleProfile',
  'bodyComposition',
  'labReport',
  'labTestResult',
  'aiChatSession',
  'aiChatMessage',
  'aiInsight',
  'healthIncident',
  'dietPlan',
  'supplementPlan',
  'hydrationPlan',
  'dailyChart',
  'exercisePlan',
  'exerciseLog',
  'dailyChecklist',
  'progressStreak',
  'inventoryItem',
  'inventoryLog',
  'sleepLog',
  'moodLog',
  'notificationPreference',
  'scheduledReminder',
  'journeyTracker',
  'trackerField',
  'trackerEntry',
  'telegramLink',
  'telegramAlertLog',
  'journeyReview',
  'oAuthClient',
  'oAuthAuthorizationCode',
  'oAuthGrant',
] as const;

const WHERE_FILTER_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'findMany',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly extendedClient: ReturnType<PrismaService['buildExtendedClient']>;

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
    this.extendedClient = this.buildExtendedClient();

    // Every existing `private prisma: PrismaService` call site keeps working unchanged:
    // model delegate access (this.prisma.user, this.prisma.sleepLog, ...) is redirected
    // to the tenant-scoping-extended client built below.
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (typeof prop === 'string' && (ALL_MODEL_DELEGATES as readonly string[]).includes(prop)) {
          return (target.extendedClient as any)[prop];
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  private buildExtendedClient() {
    return this.$extends({
      name: 'tenant-scoping',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const tenantId = tenantContext.getStore()?.tenantId;
            if (!tenantId || !TENANT_SCOPED_MODELS.has(model as Prisma.ModelName)) {
              return query(args);
            }

            const a = args as Record<string, any>;

            if (WHERE_FILTER_OPERATIONS.has(operation)) {
              a.where = { ...(a.where ?? {}), tenantId };
            }

            if (operation === 'create') {
              a.data = { tenantId, ...(a.data ?? {}) };
            }

            if (operation === 'createMany') {
              a.data = Array.isArray(a.data)
                ? a.data.map((d: Record<string, any>) => ({ tenantId, ...d }))
                : a.data;
            }

            if (operation === 'upsert') {
              a.where = { ...(a.where ?? {}), tenantId };
              a.create = { tenantId, ...(a.create ?? {}) };
            }

            return query(a);
          },
        },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
