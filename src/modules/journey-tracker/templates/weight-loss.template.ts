import { FieldCadenceDto, TrackerFieldTypeDto } from '../dto';

/** The tracker runs for this many days; the app proposes an end date from it. */
export const WEIGHT_LOSS_DURATION_DAYS = 90;

interface TemplateInputs {
  user: { goals?: any } | null;
  latestBodyComp: { weight?: number | null; waist?: number | null; bodyFat?: number | null } | null;
  hasDiet: boolean;
  hasSupplements: boolean;
  hasHydration: boolean;
  hydrationTargetMl?: number | null;
  hasExercise: boolean;
}

/**
 * Builds the suggested weight-loss tracker shape from whatever context is
 * available. Never persisted directly — the caller returns this for the user
 * to review/edit before activation (no silently-added mandatory tasks).
 */
export function buildWeightLossTemplate(inputs: TemplateInputs) {
  const goals = inputs.user?.goals || {};
  const baseline: Record<string, number> = {};
  if (inputs.latestBodyComp?.weight != null) baseline.weight = inputs.latestBodyComp.weight;
  if (inputs.latestBodyComp?.waist != null) baseline.waist = inputs.latestBodyComp.waist;
  if (inputs.latestBodyComp?.bodyFat != null) baseline.bodyFatPct = inputs.latestBodyComp.bodyFat;

  // The user's profile goals (PATCH /users/me/goals) become the tracker's targets, keyed by
  // the template's field keys. The first name in each pair is what the profile page writes;
  // the second is the older spelling kept so existing goal documents still resolve.
  const targets: Record<string, number> = {};
  const goalFor = (...names: string[]) => {
    for (const name of names) {
      if (typeof goals[name] === 'number') return goals[name] as number;
    }
    return undefined;
  };
  const goalTargets: Record<string, number | undefined> = {
    weight: goalFor('targetWeightKg', 'targetWeight'),
    waist: goalFor('targetWaistCm', 'targetWaist'),
    bodyFatPct: goalFor('targetBodyFatPercent', 'targetBodyFatPct'),
    steps: goalFor('targetDailySteps'),
    sleep: goalFor('targetSleepHours'),
    water: goalFor('targetWaterIntakeMl'),
  };
  for (const [key, value] of Object.entries(goalTargets)) {
    if (value != null) targets[key] = value;
  }

  const fields: Array<{
    key: string;
    label: string;
    type: TrackerFieldTypeDto;
    unit?: string;
    options?: string[];
    required?: boolean;
    chartable?: boolean;
    cadence?: FieldCadenceDto;
    sortOrder: number;
  }> = [
    // Body measurements change slowly, so they are weekly-review fields; the rest are daily.
    {
      key: 'weight',
      label: 'Weight',
      type: TrackerFieldTypeDto.NUMBER,
      unit: 'kg',
      chartable: true,
      cadence: FieldCadenceDto.WEEKLY,
      sortOrder: 0,
    },
    {
      key: 'waist',
      label: 'Waist',
      type: TrackerFieldTypeDto.NUMBER,
      unit: 'cm',
      chartable: true,
      cadence: FieldCadenceDto.WEEKLY,
      sortOrder: 1,
    },
    {
      key: 'steps',
      label: 'Steps',
      type: TrackerFieldTypeDto.NUMBER,
      chartable: true,
      sortOrder: 2,
    },
    {
      key: 'sleep',
      label: 'Sleep',
      type: TrackerFieldTypeDto.NUMBER,
      unit: 'h',
      chartable: true,
      sortOrder: 3,
    },
    { key: 'energy', label: 'Energy', type: TrackerFieldTypeDto.RATING, sortOrder: 4 },
    { key: 'mood', label: 'Mood', type: TrackerFieldTypeDto.RATING, sortOrder: 5 },
    {
      key: 'weightChange',
      label: 'Change from start',
      type: TrackerFieldTypeDto.FORMULA,
      unit: 'kg',
      chartable: true,
      sortOrder: 6,
    },
  ];

  if (inputs.hasDiet) {
    fields.push(
      {
        key: 'calories',
        label: 'Calories',
        type: TrackerFieldTypeDto.NUMBER,
        unit: 'kcal',
        chartable: true,
        sortOrder: 7,
      },
      {
        key: 'mealAdherence',
        label: 'Followed diet plan',
        type: TrackerFieldTypeDto.CHECKBOX,
        sortOrder: 8,
      },
    );
  }
  if (inputs.hasHydration) {
    fields.push({
      key: 'water',
      label: 'Water',
      type: TrackerFieldTypeDto.NUMBER,
      unit: 'ml',
      target: inputs.hydrationTargetMl ? { goal: inputs.hydrationTargetMl } : undefined,
      chartable: true,
      sortOrder: 9,
    } as any);
  }
  if (inputs.hasExercise) {
    fields.push(
      {
        key: 'exerciseCompleted',
        label: 'Exercise completed',
        type: TrackerFieldTypeDto.CHECKBOX,
        sortOrder: 10,
      },
      {
        key: 'exerciseMinutes',
        label: 'Exercise minutes',
        type: TrackerFieldTypeDto.NUMBER,
        unit: 'min',
        chartable: true,
        sortOrder: 11,
      },
    );
  }
  if (inputs.hasSupplements) {
    fields.push({
      key: 'supplementsTaken',
      label: 'Took supplements',
      type: TrackerFieldTypeDto.CHECKBOX,
      sortOrder: 12,
    });
  }

  fields.sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    name: '90-Day Weight-Loss Journey',
    type: 'weight-loss',
    cadence: 'DAILY' as const,
    baseline,
    targets,
    settings: { syncWeightFieldKey: 'weight', durationDays: WEIGHT_LOSS_DURATION_DAYS },
    fields,
  };
}
