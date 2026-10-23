// Integrationstest gegen echtes Postgres: Buchungen mit uebergebenem EntityManager laufen in der aeusseren
// Transaktion und rollen mit ihr zurueck. Startet nur mit COIN_IT_DB (Verbindung aus DB_HOST/DB_NAME/DB_USER/
// DB_PASSWORD), z. B. im Loadtest-Container: docker exec -e COIN_IT_DB=1 XXX_backend_load npx jest coin.integration
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CoinService } from './coin.service';
import { UserCoinBalance } from './entities/user-coin-balance.entity';
import { CoinTransaction } from './entities/coin-transaction.entity';

const run = process.env.COIN_IT_DB ? describe : describe.skip;

run('CoinService mit aeusserer Transaktion (echtes Postgres)', () => {
    let ds: DataSource;
    let coins: CoinService;
    let userId: string;

    beforeAll(async () => {
        ds = new DataSource({
            type: 'postgres', host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 5432),
            database: process.env.DB_NAME, username: process.env.DB_USER, password: process.env.DB_PASSWORD,
            entities: [__dirname + '/../../../**/*.entity{.ts,.js}'],
        });
        await ds.initialize();
        coins = new CoinService(ds.getRepository(UserCoinBalance), ds.getRepository(CoinTransaction), {} as any, ds);
        [{ id: userId }] = await ds.query(`SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`);
        await coins.ensureBalance(userId);
    });
    afterAll(() => ds?.destroy());

    const balance = async () => (await ds.getRepository(UserCoinBalance).findOneByOrFail({ user_id: userId })).balance;

    it('Fehler nach der Auszahlung rollt Guthaben und Buchung mit zurueck', async () => {
        const before = await balance();
        const key = `it:rollback:${Date.now()}`;
        await expect(ds.transaction(async (manager) => {
            await coins.addCoins(userId, 7, 'earned_win', undefined, key, manager);
            throw new Error('Abbruch nach der Auszahlung');
        })).rejects.toThrow('Abbruch nach der Auszahlung');
        expect(await balance()).toBe(before);
        expect(await ds.getRepository(CoinTransaction).countBy({ idempotency_key: key })).toBe(0);
    });

    it('ohne Fehler wird mit der aeusseren Transaktion gebucht', async () => {
        const before = await balance();
        const key = `it:commit:${Date.now()}`;
        await ds.transaction((manager) => coins.addCoins(userId, 7, 'earned_win', undefined, key, manager));
        expect(await balance()).toBe(before + 7);
        await coins.spendCoins(userId, 7, 'spent_vote', undefined, `${key}:back`);
        expect(await balance()).toBe(before);
    });
});
