import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

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

/**
 * Counted per HTTP request actually sent, so a call that 429s five times before
 * succeeding shows as six requests — which is what the API's per-IP budget sees.
 * `bucket` is the rate-limit pool the request is billed to; summing this by
 * bucket across every character's container is the fleet's real consumption.
 */
export const apiRequestsCounter = new Counter({
  name: 'arty_api_requests_total',
  help: 'ArtifactsMMO API requests sent, by rate-limit bucket, endpoint and outcome',
  labelNames: ['character', 'bucket', 'endpoint', 'outcome'] as const,
  registers: [register],
});

/**
 * Wall-clock time a character spent parked in 429 backoff. The request counter
 * says how much budget we spent; this says what it cost us in progress.
 */
export const rateLimitBackoffSeconds = new Counter({
  name: 'arty_api_rate_limit_backoff_seconds_total',
  help: 'Seconds slept waiting out a 429, by rate-limit bucket',
  labelNames: ['character', 'bucket', 'endpoint'] as const,
  registers: [register],
});

/**
 * Hit rate of the fight simulation memo. The logs put the duplicate rate at
 * 99%, so a hit rate well below that means loadouts are churning more than
 * expected and the simulator is being asked genuinely new questions.
 */
export const fightSimulationCacheCounter = new Counter({
  name: 'arty_fight_simulation_cache_total',
  help: 'Fight simulation lookups, by whether the result was already known',
  labelNames: ['character', 'outcome'] as const,
  registers: [register],
});

export const jobActiveGauge = new Gauge({
  name: 'arty_job_active',
  help: 'Whether a job type is currently active for a character (1=active, 0=inactive)',
  labelNames: ['character', 'job_type', 'target'] as const,
  registers: [register],
});
