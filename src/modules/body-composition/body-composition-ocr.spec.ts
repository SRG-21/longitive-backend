import { normalizeBodyCompAnnotation } from './body-composition-ocr';

// What Mistral returns for a Cult Smart Scale Pro "Measurement Report" (strict: false, so mixed types).
const CULT_REPORT = {
  reportDate: '2026-11-03',
  reportTime: '02:02:39',
  reportName: 'Sankalp',
  age: 30,
  bodyScore: '60',
  height: 182.0,
  weight: 96.3,
  bmi: 29.0,
  bodyFat: null,
  fatMass: 32.8,
  visceralFat: 12.0,
  subcutaneousFatMass: '29.5',
  skeletalMuscleMass: 35.6,
  boneMass: 3.4,
  bodyWaterMass: 46.4,
  proteinMass: 12.6,
  mineralMass: 4.4,
  bmr: '1,737.0',
  metabolicAge: 37,
  standardWeight: 72.9,
  weightControl: -21.7,
  fatControl: '-21.7',
  muscleControl: 0,
  bodyType: 'Overweight muscular',
  segmentalFat: {
    leftArm: { mass: 1.9, percent: 316.6 },
    rightArm: { mass: 1.8, percent: '300.0%' },
    trunk: { mass: 17.0, percent: 96.3 },
    leftLeg: { mass: 4.6, percent: 255.5 },
    rightLeg: { mass: 4.4, percent: 244.4 },
  },
  segmentalMuscle: {
    leftArm: { mass: 3.1, percent: 81.5 },
    rightArm: { mass: 3.3, percent: 86.8 },
    trunk: { mass: 28.3, percent: 93.3 },
    leftLeg: { mass: 9.7, percent: 92.3 },
    rightLeg: { mass: 10.0, percent: 95.2 },
  },
  deviceName: 'Cult Smart Scale Pro',
  deviceId: 'A0:B7:65:A7:69:EE',
  waist: null,
};

describe('normalizeBodyCompAnnotation', () => {
  it('keeps every value from a Cult Smart Scale report', () => {
    const { values, day, measuredTime } = normalizeBodyCompAnnotation(CULT_REPORT);
    expect(day).toBe('2026-11-03');
    expect(measuredTime).toBe('02:02:39');
    expect(values).toMatchObject({
      reportName: 'Sankalp',
      age: 30,
      bodyScore: 60,
      height: 182,
      weight: 96.3,
      bmi: 29,
      fatMass: 32.8,
      visceralFat: 12,
      subcutaneousFatMass: 29.5,
      skeletalMuscleMass: 35.6,
      boneMass: 3.4,
      bodyWaterMass: 46.4,
      proteinMass: 12.6,
      mineralMass: 4.4,
      bmr: 1737,
      metabolicAge: 37,
      standardWeight: 72.9,
      weightControl: -21.7,
      fatControl: -21.7,
      muscleControl: 0,
      bodyType: 'Overweight muscular',
      deviceName: 'Cult Smart Scale Pro',
      deviceId: 'A0:B7:65:A7:69:EE',
    });
    expect(values.segmentalFat).toEqual(
      CULT_REPORT.segmentalFat && {
        ...CULT_REPORT.segmentalFat,
        rightArm: { mass: 1.8, percent: 300 },
      },
    );
    expect(values.segmentalMuscle).toEqual(CULT_REPORT.segmentalMuscle);
    expect(values).not.toHaveProperty('waist');
  });

  it('derives body fat, water and subcutaneous % from kg when only the mass is printed', () => {
    const { values } = normalizeBodyCompAnnotation(CULT_REPORT);
    expect(values.bodyFat).toBe(34.1); // 32.8 / 96.3
    expect(values.bodyWater).toBe(48.2); // 46.4 / 96.3
    expect(values.subcutaneousFat).toBe(30.6); // 29.5 / 96.3
  });

  it('keeps a printed percentage instead of deriving one', () => {
    const { values } = normalizeBodyCompAnnotation({ weight: 80, bodyFat: 25, fatMass: 30 });
    expect(values.bodyFat).toBe(25);
  });

  it('drops a bad date or time, and empty segments', () => {
    const r = normalizeBodyCompAnnotation({
      reportDate: '2026-13-03',
      reportTime: '02:02:39',
      segmentalFat: { leftArm: { mass: null, percent: null } },
      weight: 70,
    });
    expect(r.day).toBeNull();
    expect(r.measuredTime).toBeNull();
    expect(r.values.segmentalFat).toBeUndefined();
    expect(
      normalizeBodyCompAnnotation({ reportDate: '2026-11-03', reportTime: '25:00' }).measuredTime,
    ).toBeNull();
  });
});
