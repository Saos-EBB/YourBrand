// Integrationstest gegen echtes Postgres: Zeilen, die beim ersten Zugriff angelegt werden, entstehen auch bei
// parallelen ersten Requests genau einmal und ohne Fehler (Loadtest-Audit B15). Startet nur mit IT_DB (Verbindung aus
// DB_HOST/DB_NAME/DB_USER/DB_PASSWORD), z. B.: docker exec -e IT_DB=1 XXX_backend_load npx jest concurrency.integration
// Nimmt jeweils einen User, dem die Zeile noch fehlt; die angelegten Zeilen bleiben (normaler Zustand nach erstem Zugriff).
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CoinService } from './hidden/coin/coin.service';
import { UserCoinBalance } from './hidden/coin/entities/user-coin-balance.entity';
import { CoinTransaction } from './hidden/coin/entities/coin-transaction.entity';
import { NotificationsService } from './core/notifications/notifications.service';
import { Notification } from './core/notifications/entities/notification.entity';
import { NotificationSettings } from './core/notifications/entities/notification-settings.entity';
import { ProfileService } from './core/profile/profile.service';
import { Profile } from './core/profile/entities/profile.entity';
import { User } from './core/auth/entities/user.entity';
import { Interest } from './core/profile/entities/interest.entity';
import { UserInterest } from './core/profile/entities/user-interest.entity';

const run = process.env.IT_DB ? describe : describe.skip;
const PARALLEL = 8;

run('Erst-Anlage parallel (echtes Postgres)', () => {
    let ds: DataSource;

    beforeAll(async () => {
        ds = new DataSource({
            type: 'postgres', host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 5432),
            database: process.env.DB_NAME, username: process.env.DB_USER, password: process.env.DB_PASSWORD,
            entities: [__dirname + '/../**/*.entity{.ts,.js}'], extra: { max: PARALLEL * 2 },
        });
        await ds.initialize();
        // Pool vorwaermen wie unter Last: sonst bekommt der erste Aufruf die einzige offene Verbindung und ist fertig,
        // bevor die anderen verbunden sind, und das Rennen findet nie statt.
        await Promise.all(Array.from({ length: PARALLEL * 2 }, () => ds.query('SELECT pg_sleep(0.05)')));
    });
    afterAll(() => ds?.destroy());

    const userWithout = async (table: string, extra = ''): Promise<string> => {
        const [row] = await ds.query(
            `SELECT u.id FROM users u WHERE u.deleted_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM ${table} t WHERE t.user_id = u.id ${extra}) LIMIT 1`,
        );
        if (!row) throw new Error(`kein User ohne ${table}`);
        return row.id;
    };
    const parallel = (fn: () => Promise<unknown>) => Promise.all(Array.from({ length: PARALLEL }, fn));

    it(`Coin-Konto: ${PARALLEL} erste Zugriffe → ein Konto, ein Startbonus`, async () => {
        const coins = new CoinService(ds.getRepository(UserCoinBalance), ds.getRepository(CoinTransaction), {} as any, ds);
        const userId = await userWithout('user_coin_balance');
        await parallel(() => coins.getBalance(userId));
        expect(await ds.getRepository(UserCoinBalance).countBy({ user_id: userId })).toBe(1);
        expect(await ds.getRepository(CoinTransaction).countBy({ user_id: userId, type: 'starting_bonus' })).toBe(1);
    });

    it(`Notification-Settings: ${PARALLEL} erste Zugriffe → eine Zeile`, async () => {
        const notifications = new NotificationsService(
            ds.getRepository(Notification), ds.getRepository(NotificationSettings), {} as any, ds,
        );
        const userId = await userWithout('notification_settings');
        await parallel(() => notifications.getSettings(userId));
        expect(await ds.getRepository(NotificationSettings).countBy({ user_id: userId })).toBe(1);
    });

    it(`Interesse: ${PARALLEL} gleiche Aufrufe → eine Zeile`, async () => {
        const profiles = new ProfileService(
            ds.getRepository(Profile), ds.getRepository(User), ds.getRepository(Interest), ds.getRepository(UserInterest),
            {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, ds,
        );
        const [{ id: interestId }] = await ds.query(`SELECT id FROM interests LIMIT 1`);
        const userId = await userWithout('user_interests', `AND t.interest_id = '${interestId}'`);
        await parallel(() => profiles.addInterest(userId, interestId));
        expect(await ds.getRepository(UserInterest).countBy({ user_id: userId, interest_id: interestId })).toBe(1);
    });
});
