// Integrationstest gegen echtes Postgres: Beef-Zustandswechsel, die Cron und Request gleichzeitig ausloesen koennen,
// wirken genau einmal (Loadtest-Audit B3/B15). Startet nur mit IT_DB (Verbindung aus DB_HOST/DB_NAME/DB_USER/
// DB_PASSWORD), z. B.: docker exec -e IT_DB=1 XXX_backend_load npx jest concurrency.integration
// Legt eigene Beefs zwischen zwei bestehenden Usern an und raeumt sie samt Zaehler und Exil wieder auf.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { BeefService } from './beef.service';
import { BeefResolutionService } from './beef-resolution.service';
import { BeefStateMachineService } from './beef-state-machine.service';
import { GameRegistry } from './games/game.registry';
import { TicTacToeHandler } from './games/tictactoe.handler';
import { Beef, BeefStatus } from './entities/beef.entity';
import { BeefGame } from './entities/beef-game.entity';
import { BeefVote } from './entities/beef-vote.entity';
import { Badge } from '../badge/entities/badge.entity';
import { Tooth } from '../teeth/entities/tooth.entity';

const run = process.env.IT_DB ? describe : describe.skip;
const PARALLEL = 8;

run('Beef-Zustandswechsel parallel (echtes Postgres)', () => {
    let ds: DataSource;
    let beefs: BeefService;
    let resolution: BeefResolutionService;
    let a: string, b: string;
    let saved: { id: string; chicken_count: number; exile_until: Date | null }[];
    const created: string[] = [];

    beforeAll(async () => {
        ds = new DataSource({
            type: 'postgres', host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 5432),
            database: process.env.DB_NAME, username: process.env.DB_USER, password: process.env.DB_PASSWORD,
            entities: [__dirname + '/../../../**/*.entity{.ts,.js}'], extra: { max: PARALLEL * 2 },
        });
        await ds.initialize();
        // Pool vorwaermen wie unter Last: sonst bekommt der erste Aufruf die einzige offene Verbindung und ist fertig,
        // bevor die anderen verbunden sind, und das Rennen findet nie statt.
        await Promise.all(Array.from({ length: PARALLEL * 2 }, () => ds.query('SELECT pg_sleep(0.05)')));
        const registry = new GameRegistry();
        registry.register(new TicTacToeHandler());
        const settings = { getNumber: async (_k: string, fallback: number) => fallback } as any;
        const notifications = { notifyBeefWon: async () => undefined, notifyBeefLost: async () => undefined } as any;
        const events = { emit: () => true } as any;
        resolution = new BeefResolutionService(
            ds.getRepository(BeefVote), ds.getRepository(Badge), ds.getRepository(Tooth),
            {} as any, notifications, events, ds, settings,
        );
        beefs = new BeefService(
            ds.getRepository(Beef), ds.getRepository(BeefVote), {} as any, {} as any, ds.getRepository(BeefGame),
            {} as any, notifications, events, ds, resolution, new BeefStateMachineService(), registry, settings,
        );
        [{ id: a }, { id: b }] = await ds.query(`SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 2`);
        saved = await ds.query(`SELECT id, chicken_count, exile_until FROM users WHERE id = ANY($1)`, [[a, b]]);
    });

    afterAll(async () => {
        if (!ds?.isInitialized) return;
        if (created.length) await ds.query(`DELETE FROM beefs WHERE id = ANY($1)`, [created]);
        for (const u of saved ?? []) {
            await ds.query(`UPDATE users SET chicken_count = $2, exile_until = $3 WHERE id = $1`, [u.id, u.chicken_count, u.exile_until]);
        }
        await ds.destroy();
    });

    const newBeef = async (status: BeefStatus): Promise<Beef> => {
        const [{ id }] = await ds.query(
            `INSERT INTO beefs (initiator_id, target_id, tldr, chat_passage, status, game_type, duration_seconds)
             VALUES ($1, $2, 'it', 'it', $3, 'tictactoe', 60) RETURNING id`,
            [a, b, status],
        );
        created.push(id);
        return ds.getRepository(Beef).findOneByOrFail({ id });
    };
    const chickenCount = async () => (await ds.query(`SELECT chicken_count FROM users WHERE id = $1`, [b]))[0].chicken_count as number;

    it(`chickenBeef ${PARALLEL}× gleichzeitig: Zaehler steigt genau um 1`, async () => {
        const beef = await newBeef(BeefStatus.WAITING);
        const before = await chickenCount();
        await Promise.all(Array.from({ length: PARALLEL }, () => beefs.chickenBeef(beef.id, 'timeout')));
        expect(await chickenCount()).toBe(before + 1);
        expect((await ds.getRepository(Beef).findOneByOrFail({ id: beef.id })).status).toBe(BeefStatus.CHICKENED);
    });

    it(`startGamePhase ${PARALLEL}× gleichzeitig: genau ein Spiel`, async () => {
        const beef = await newBeef(BeefStatus.ACTIVE);
        const results = await Promise.allSettled(Array.from({ length: PARALLEL }, () => beefs.startGamePhase(beef.id)));
        expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
        expect(await ds.getRepository(BeefGame).countBy({ beef_id: beef.id })).toBe(1);
        expect((await ds.getRepository(Beef).findOneByOrFail({ id: beef.id })).status).toBe(BeefStatus.GAME_PENDING);
    });

    it(`resolve ${PARALLEL}× gleichzeitig: Badges und Zahn genau einmal`, async () => {
        const beef = await newBeef(BeefStatus.IN_GAME);
        await Promise.all(Array.from({ length: PARALLEL }, async () => {
            const copy = await ds.getRepository(Beef).findOneByOrFail({ id: beef.id });
            await resolution.resolve(copy, a);
        }));
        expect(await ds.getRepository(Badge).countBy({ beef_id: beef.id })).toBe(2);
        expect(await ds.getRepository(Tooth).countBy({ beef_id: beef.id })).toBe(1);
        expect((await ds.getRepository(Beef).findOneByOrFail({ id: beef.id })).status).toBe(BeefStatus.CLOSED);
    });
});
