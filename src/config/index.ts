export interface Config {
  port: number;
  temporalAddress: string;
  temporalNamespace: string;
  taskQueue: string;
  redisUrl: string;
  supplierBaseUrl: string;
  supplierTimeoutMs: number;
  snapshotTtlSeconds: number;
  supplierADown: boolean;
  supplierBDown: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const integer = (name: string, fallback: number, min: number, max: number): number => {
    const raw = env[name] ?? String(fallback);
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
  };
  const boolean = (name: string): boolean => {
    if (env[name] === undefined || env[name] === 'false') return false;
    if (env[name] === 'true') return true;
    throw new Error(`${name} must be true or false`);
  };
  const text = (name: string, fallback: string): string => {
    const value = env[name] ?? fallback;
    if (!value.trim()) throw new Error(`${name} must not be empty`);
    return value;
  };
  const port = integer('HOTEL_PORT', 3000, 1, 65535);
  const supplierBaseUrl = text('SUPPLIER_BASE_URL', `http://127.0.0.1:${port}`);
  const redisUrl = text('REDIS_URL', 'redis://127.0.0.1:6379');
  if (!['http:', 'https:'].includes(new URL(supplierBaseUrl).protocol)) {
    throw new Error('SUPPLIER_BASE_URL must be an HTTP(S) URL');
  }
  if (!['redis:', 'rediss:'].includes(new URL(redisUrl).protocol)) {
    throw new Error('REDIS_URL must be a Redis URL');
  }
  return {
    port,
    temporalAddress: text('TEMPORAL_ADDRESS', '127.0.0.1:7233'),
    temporalNamespace: text('TEMPORAL_NAMESPACE', 'default'),
    taskQueue: text('TEMPORAL_TASK_QUEUE', 'hotel-offers'),
    redisUrl,
    supplierBaseUrl,
    supplierTimeoutMs: integer('SUPPLIER_TIMEOUT_MS', 3000, 100, 5000),
    snapshotTtlSeconds: integer('SNAPSHOT_TTL_SECONDS', 600, 60, 86400),
    supplierADown: boolean('MOCK_SUPPLIER_A_DOWN'),
    supplierBDown: boolean('MOCK_SUPPLIER_B_DOWN'),
  };
}
