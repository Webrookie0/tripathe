import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler } from 'express';
import type { Config } from '../config';
import type { HotelOffer, HotelQuery } from '../domain/types';
import { fixtures } from '../mocks/fixtures';
import { fetchSupplierHotels } from '../activities/suppliers';
import { log } from '../logging';
import { HttpError } from './errors';
import { mapFailure } from './failure-mapping';
import { parseCity, parseHotelQuery } from './validation';

export interface AppDependencies {
  getHotels(query: HotelQuery, requestId: string, onStart: (workflowId: string) => void): Promise<HotelOffer[]>;
  redisHealth(): Promise<unknown>;
  temporalHealth(): Promise<unknown>;
}

export function createApp(config: Config, dependencies: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use((req, res, next) => {
    const providedId = req.get('x-request-id');
    const requestId = providedId && /^[a-zA-Z0-9_-]{1,80}$/.test(providedId) ? providedId : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    res.setHeader('cache-control', 'no-store');
    const started = Date.now();
    res.on('finish', () => log('info', 'HTTP request completed', {
      requestId, method: req.method, path: req.path, status: res.statusCode,
      workflowId: res.locals.workflowId, durationMs: Date.now() - started,
    }));
    next();
  });

  for (const [path, supplier, down] of [
    ['/supplierA/hotels', 'Supplier A', config.supplierADown],
    ['/supplierB/hotels', 'Supplier B', config.supplierBDown],
  ] as const) {
    app.get(path, (req, res) => {
      if (down) throw new HttpError(503, 'MOCK_SUPPLIER_DOWN', `${supplier} is temporarily unavailable`);
      const city = req.query.city === undefined ? undefined : parseCity(req.query.city);
      res.json(city === undefined ? fixtures[supplier] : fixtures[supplier].filter((hotel) => hotel.city === city));
    });
  }

  app.get('/api/hotels', async (req, res) => {
    const query = parseHotelQuery(req.query);
    const offers = await dependencies.getHotels(query, res.locals.requestId as string, (workflowId) => {
      res.locals.workflowId = workflowId;
      res.setHeader('x-workflow-id', workflowId);
    });
    res.json(offers);
  });

  // Container liveness should stay green while dependencies are temporarily down.
  app.get('/live', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health', async (_req, res) => {
    const checks = {
      supplierA: () => fetchSupplierHotels('Supplier A', 'delhi', config.supplierBaseUrl, config.supplierTimeoutMs),
      supplierB: () => fetchSupplierHotels('Supplier B', 'delhi', config.supplierBaseUrl, config.supplierTimeoutMs),
      redis: () => dependencies.redisHealth(),
      temporal: () => dependencies.temporalHealth(),
    };
    const entries = await Promise.all(Object.entries(checks).map(async ([name, check]) => {
      const started = Date.now();
      try {
        await check();
        return [name, { status: 'up', latencyMs: Date.now() - started }] as const;
      } catch {
        return [name, { status: 'down', latencyMs: Date.now() - started }] as const;
      }
    }));
    const healthy = entries.every(([, value]) => value.status === 'up');
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', dependencies: Object.fromEntries(entries) });
  });

  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Endpoint not found')));
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const failure = mapFailure(error);
    log(failure.status >= 500 ? 'error' : 'warn', 'HTTP request failed', {
      requestId: res.locals.requestId, workflowId: res.locals.workflowId, code: failure.code,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    if (!res.headersSent) res.status(failure.status).json({ error: { code: failure.code, message: failure.message, requestId: res.locals.requestId } });
  };
  app.use(errorHandler);
  return app;
}
