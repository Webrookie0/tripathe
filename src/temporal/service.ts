import { randomUUID } from 'node:crypto';
import { Client, Connection } from '@temporalio/client';
import type { Config } from '../config';
import type { HotelOffer, HotelQuery } from '../domain/types';
import { HttpError } from '../api/errors';

export class HotelWorkflowService {
  private connection?: Connection;
  private connecting?: Promise<Client>;

  constructor(private readonly config: Config) {}

  private getClient(): Promise<Client> {
    if (this.connecting) return this.connecting;
    const pending = Connection.connect({ address: this.config.temporalAddress, connectTimeout: '3 seconds' })
      .then((connection: Connection) => {
        this.connection = connection;
        return new Client({ connection, namespace: this.config.temporalNamespace });
      }).catch(() => {
        this.connecting = undefined;
        throw new HttpError(503, 'ORCHESTRATOR_UNAVAILABLE', 'Unable to connect to hotel orchestration');
      });
    this.connecting = pending;
    return pending;
  }

  async getHotels(query: HotelQuery, requestId: string, onStart: (workflowId: string) => void): Promise<HotelOffer[]> {
    const client = await this.getClient();
    const workflowId = `hotels-${randomUUID()}`;
    const handle = await client.connection.withDeadline(Date.now() + 5000, () =>
      client.workflow.start('hotelOffersWorkflow', {
        taskQueue: this.config.taskQueue,
        workflowId,
        workflowExecutionTimeout: '45 seconds',
        args: [{ ...query, requestId, snapshotTtlSeconds: this.config.snapshotTtlSeconds }],
      }),
    );
    onStart(workflowId);
    // Bound result polling as well: if Temporal goes offline after start,
    // waiting for gRPC indefinitely must not hold an HTTP request open.
    return client.connection.withDeadline(Date.now() + 50000, () => handle.result());
  }

  async health(): Promise<void> {
    const client = await this.getClient();
    await client.connection.withDeadline(Date.now() + 3000, () =>
      client.connection.workflowService.describeNamespace({ namespace: this.config.temporalNamespace }),
    );
  }

  async close(): Promise<void> {
    if (this.connecting) await this.connecting.catch(() => undefined);
    await this.connection?.close();
  }
}
