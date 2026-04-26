import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

export const register = new Registry();

collectDefaultMetrics({ register });

export const jobCompletionsCounter = new Counter({
  name: 'arty_job_completions_total',
  help: 'Total number of completed jobs per character',
  labelNames: ['character', 'job_type', 'target', 'status'] as const,
  registers: [register],
});

export const jobDurationHistogram = new Histogram({
  name: 'arty_job_duration_seconds',
  help: 'Duration of jobs in seconds',
  labelNames: ['character', 'job_type', 'target'] as const,
  buckets: [5, 15, 30, 60, 120, 300, 600, 1800, 3600],
  registers: [register],
});

export const jobActiveGauge = new Gauge({
  name: 'arty_job_active',
  help: 'Whether a job type is currently active for a character (1=active, 0=inactive)',
  labelNames: ['character', 'job_type', 'target'] as const,
  registers: [register],
});
