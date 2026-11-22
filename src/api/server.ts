import { createApp } from './app';
import { loadConfig } from '../config';
import { createRedis } from '../redis/store';
import { HotelWorkflowService } from '../temporal/service';
import { log } from '../logging';

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = createRedis(config.redisUrl);
  const temporal = new HotelWorkflowService(config);
  // The HTTP process starts even if Redis/Temporal is unavailable; /health
  // explains the problem, and the Redis client reconnects in the background.
  void redis.connect().catch(() => log('warn', 'Initial Redis connection failed'));
  const app = createApp(config, {
    getHotels: (query, requestId, onStart) => temporal.getHotels(query, requestId, onStart),
    redisHealth: () => redis.ping(),
    temporalHealth: () => temporal.health(),
  });
  const server = app.listen(config.port, '0.0.0.0', () => log('info', 'Hotel API listening', { port: config.port }));
  server.requestTimeout = 60000;
  server.setTimeout(60000);
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    log('info', 'Shutting down API');
    const force = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 55000);
    force.unref();
    server.close(() => {
      void temporal.close().catch(() => log('warn', 'Temporal connection shutdown failed')).finally(() => {
        redis.disconnect();
        clearTimeout(force);
      });
    });
    server.closeIdleConnections();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  server.on('error', (error) => { log('error', 'HTTP server failed', { error: error.message }); redis.disconnect(); process.exitCode = 1; });
}

void main().catch((error: unknown) => {
  log('error', 'API startup failed', { error: error instanceof Error ? error.message : 'Unknown error' });
  process.exitCode = 1;
});
