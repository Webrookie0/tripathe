import { NativeConnection, Worker } from '@temporalio/worker';
import { loadConfig } from '../config';
import { createActivities } from '../activities';
import { createRedis, OfferStore } from '../redis/store';
import { log } from '../logging';

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = createRedis(config.redisUrl);
  let connection: NativeConnection | undefined;
  try {
    await redis.connect();
    connection = await NativeConnection.connect({ address: config.temporalAddress });
    const worker = await Worker.create({
      connection,
      namespace: config.temporalNamespace,
      taskQueue: config.taskQueue,
      workflowsPath: require.resolve('./workflows'),
      activities: createActivities(config, new OfferStore(redis)),
      shutdownGraceTime: '20 seconds',
    });
    log('info', 'Temporal worker started', { taskQueue: config.taskQueue });
    // Worker.run() installs the SDK's SIGINT/SIGTERM shutdown handling.
    await worker.run();
  } finally {
    redis.disconnect();
    await connection?.close();
  }
}

void main().catch((error: unknown) => {
  log('error', 'Worker failed', { error: error instanceof Error ? error.message : 'Unknown error' });
  process.exitCode = 1;
});
