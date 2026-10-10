import 'reflect-metadata';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ModuleBroker } from '../../shared/broker/module-broker';
import { ShopRedeemService, normalizeUnlockCode } from './shop-redeem.service';

process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);
const USER = '11111111-1111-4111-8111-111111111111';
const CODE = { id: 'c1', redeemed_at: null, revoked_at: null, unlock_target: 'coins:500', order_id: 'o1', order_status: 'fulfilled' };

function setup(row: Partial<typeof CODE> | null, opts: { coins?: boolean; raced?: boolean; failUnlock?: boolean } = {}) {
    const calls: string[] = [];
    const query = jest.fn(async (sql: string) => {
        calls.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
        if (sql.trim().startsWith('SELECT')) return row ? [{ ...CODE, ...row }] : [];
        if (sql.includes('redeemed_at = now()')) return opts.raced ? [[], 0] : [[{ id: 'c1' }], 1];
        return [];
    });
    const broker = new ModuleBroker();
    const credit = jest.fn(async () => { if (opts.failUnlock) throw new Error('db weg'); });
    if (opts.coins !== false) broker.provideUnlock('coins', credit);
    return { service: new ShopRedeemService({ query } as any, broker), credit, calls };
}

describe('normalizeUnlockCode', () => {
    it('Kleinbuchstaben, Leerzeichen und fehlende Striche', () => {
        expect(normalizeUnlockCode(' y7qz bggy vxdd ')).toBe('Y7QZ-BGGY-VXDD');
        expect(normalizeUnlockCode('Y7QZBGGYVXDD')).toBe('Y7QZ-BGGY-VXDD');
        expect(normalizeUnlockCode('KURZ')).toBe('KURZ');
    });
});

describe('ShopRedeemService', () => {
    it('schreibt ueber die Vermittlung gut, einmal pro Code', async () => {
        const { service, credit, calls } = setup({});
        await expect(service.redeem(USER, 'y7qz-bggy-vxdd')).resolves.toEqual({ kind: 'coins', amount: 500 });
        expect(credit).toHaveBeenCalledWith({ userId: USER, amount: 500, idempotencyKey: 'shop-code-c1' });
        expect(calls.at(-1)).toMatch(/^INSERT INTO shop_order_events/);
    });

    it('Coins-Modul aus: Code bleibt unverbraucht', async () => {
        const { service, calls } = setup({}, { coins: false });
        await expect(service.redeem(USER, 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(calls.some((c) => c.startsWith('UPDATE'))).toBe(false);
    });

    it('Premium hat (noch) keinen Anbieter', async () => {
        const { service } = setup({ unlock_target: 'premium:30' });
        await expect(service.redeem(USER, 'x')).rejects.toThrow(/bleibt gültig/);
    });

    it('Gutschrift scheitert: Code wird wieder frei', async () => {
        const { service, calls } = setup({}, { failUnlock: true });
        await expect(service.redeem(USER, 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(calls.filter((c) => c.startsWith('UPDATE'))).toHaveLength(2);
    });

    it('unbekannt, schon eingeloest, gesperrt, erstattet, gleichzeitig', async () => {
        await expect(setup(null).service.redeem(USER, 'x')).rejects.toBeInstanceOf(NotFoundException);
        await expect(setup({ order_id: null as any }).service.redeem(USER, 'x')).rejects.toBeInstanceOf(NotFoundException);
        await expect(setup({ redeemed_at: '2026-10-11' as any }).service.redeem(USER, 'x')).rejects.toThrow(/schon eingelöst/);
        await expect(setup({ revoked_at: '2026-10-11' as any }).service.redeem(USER, 'x')).rejects.toThrow(/gesperrt/);
        await expect(setup({ order_status: 'refunded' }).service.redeem(USER, 'x')).rejects.toThrow(/nicht mehr gültig/);
        await expect(setup({}, { raced: true }).service.redeem(USER, 'x')).rejects.toBeInstanceOf(ConflictException);
    });
});
