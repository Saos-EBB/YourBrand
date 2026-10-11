// Unit-Tests: @nestjs/bullmq liegt als ESM vor und laesst sich von Jest (ts-jest, CommonJS)
// nicht laden. Die Specs testen nur Logik, Queues/Worker laufen dort nie — Dekoratoren
// werden zu No-ops. Eingebunden ueber moduleNameMapper in package.json (nur Unit-Tests).
const noopDecorator = () => () => undefined;

export const Processor = noopDecorator;
export const OnWorkerEvent = noopDecorator;
export const InjectQueue = noopDecorator;
export class WorkerHost { }
export const getQueueToken = (name?: string) => `BullQueue_${name ?? 'default'}`;
export const BullModule = {
    forRootAsync: () => ({ module: class BullRootStub { } }),
    registerQueue: () => ({ module: class BullQueueStub { } }),
};
