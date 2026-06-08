import { Objective } from '../../src/core/Objective.js';
import { jobActiveGauge } from '../../src/metrics.js';

/**
 * Minimal concrete Objective so we can exercise the base-class
 * startJob/completeJob metric behaviour directly.
 */
class TestObjective extends Objective {
  constructor(character: any) {
    super(character, 'test_metric_objective', 'not_started');
    this.shouldEmitMetrics = true;
    this.jobFlavour = 'TestJob';
    this.metricLabel = 'test_target';
  }

  async run(): Promise<boolean> {
    return true;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }
}

const makeCharacter = (name: string) =>
  ({ data: { name }, jobList: [], itemsToKeep: [] }) as any;

const getActiveGauge = async (character: string) => {
  const metric = await jobActiveGauge.get();
  const found = metric.values.find(
    (v) =>
      v.labels.character === character &&
      v.labels.job_type === 'TestJob' &&
      v.labels.target === 'test_target',
  );
  return found?.value;
};

describe('Objective active-job gauge', () => {
  it('sets the active gauge to 1 when a job starts', async () => {
    const obj = new TestObjective(makeCharacter('StartChar'));

    obj.startJob();

    expect(await getActiveGauge('StartChar')).toBe(1);
  });

  it('resets the active gauge to 0 when a completed job finishes', async () => {
    const obj = new TestObjective(makeCharacter('CompleteChar'));

    obj.startJob();
    obj.completeJob(true);

    expect(await getActiveGauge('CompleteChar')).toBe(0);
  });

  it('resets the active gauge to 0 when a started job is cancelled', async () => {
    const obj = new TestObjective(makeCharacter('CancelChar'));

    obj.startJob();
    expect(await getActiveGauge('CancelChar')).toBe(1);

    // Simulate the job being cancelled mid-flight, then finishing unsuccessfully.
    obj.status = 'cancelled';
    obj.completeJob(false);

    expect(await getActiveGauge('CancelChar')).toBe(0);
  });
});
