import { LastActiveService } from './last-active.service';

describe('LastActiveService.touch', () => {
    afterEach(() => jest.useRealTimers());

    it('schreibt pro User hoechstens einmal pro Minute nach Redis', async () => {
        jest.useFakeTimers({ now: 1_000_000 });
        const redis = { set: jest.fn(async () => 'OK'), sadd: jest.fn(async () => 1) };
        const service = new LastActiveService(redis as any, {} as any, {} as any);

        await service.touch('u1');
        await service.touch('u1');
        await service.touch('u2');
        expect(redis.set).toHaveBeenCalledTimes(2);

        jest.setSystemTime(1_000_000 + 60_000);
        await service.touch('u1');
        expect(redis.set).toHaveBeenCalledTimes(3);
        expect(redis.sadd).toHaveBeenCalledTimes(3);
    });
});
