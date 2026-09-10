/**
 * Coin-Transaktionen-Seed
 * Ausfuehren: SEED_TX_PER_USER=20 npx ts-node -r tsconfig-paths/register src/database/seeds/seed-coin-transactions.ts
 *
 * Legt fuer jeden User (45 YAML-Demo-User + seed_user_* aus seed-extra-users.ts)
 * SEED_TX_PER_USER zufaellige coin_transactions an und pflegt user_coin_balance
 * exakt nach: balance = bisheriger Wert + Summe der neu generierten Betraege.
 *
 * type kommt zufaellig aus der chk_coin_tx_type-Liste (migrations/001_baseline.sql), amount
 * ist positiv fuer purchase, alle earned_-Typen, starting_bonus und
 * lottery_win, negativ fuer alle spent_-Typen und house_cut. beef_id bleibt
 * immer NULL (keine Beef-Verknuepfung fuer Seed-Daten).
 *
 * Idempotent: coin_transactions.idempotency_key = "seed:<user_id>:<n>"
 * markiert Seed-Zeilen eindeutig. User mit vorhandenen Seed-Transaktionen
 * werden uebersprungen. SEED_RESET=true loescht alle "seed:%"-Transaktionen
 * und baut sie neu auf.
 *
 * user_coin_balance wird immer als fertig berechneter Zielwert geschrieben
 * (nicht als DB-seitiges "balance = balance + delta"): Postgres prueft bei
 * INSERT ... ON CONFLICT DO UPDATE den CHECK-Constraint offenbar gegen den
 * rohen VALUES-Kandidaten, bevor die SET-Berechnung greift — ein negatives
 * Delta scheitert an chk_coin_balance_non_negative selbst dann, wenn die
 * Summe am Ende positiv waere (empirisch mit purem SQL reproduziert).
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';
import { createRng, randomInt, randomChoice, seedFromString, buildBulkInsert } from './seed-shared';

const ds = new DataSource({
    type: 'postgres',
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME     ?? '',
    username: process.env.DB_USER     ?? '',
    password: process.env.DB_PASSWORD ?? '',
    synchronize: false,
    logging: false,
    extra: { options: '-c client_encoding=UTF8' },
});

const SEED_TX_PER_USER = parseInt(process.env.SEED_TX_PER_USER ?? '0', 10);
const SEED_RESET = (process.env.SEED_RESET ?? 'false').toLowerCase() === 'true';

// Muss exakt der CHECK-Constraint chk_coin_tx_type aus migrations/001_baseline.sql entsprechen.
const COIN_TX_TYPES = [
    'purchase', 'earned_beef_open', 'earned_comment', 'earned_win', 'earned_vote_win',
    'spent_vote', 'house_cut', 'lottery_win', 'starting_bonus',
    'spent_beef_open', 'spent_beef_accept',
] as const;
const NEGATIVE_TYPES = new Set(['spent_vote', 'house_cut', 'spent_beef_open', 'spent_beef_accept']);
// Groessen der echten Coin-Packages (CoinService), fuer plausible 'purchase'-Betraege.
const COIN_PACKAGE_SIZES = [100, 500, 2000, 10000];

function randomCoinAmount(rng: () => number, type: string): number {
    if (type === 'purchase') return randomChoice(rng, COIN_PACKAGE_SIZES);
    const magnitude = randomInt(rng, 1, 200);
    return NEGATIVE_TYPES.has(type) ? -magnitude : magnitude;
}

async function main() {
    if (SEED_TX_PER_USER <= 0) {
        console.log('seed-coin-transactions: SEED_TX_PER_USER=0 — nichts zu tun');
        return;
    }

    await ds.initialize();
    console.log('seed-coin-transactions: verbunden mit DB', process.env.DB_NAME);

    const deletedSumByUser = new Map<string, number>();
    if (SEED_RESET) {
        const [deletedRows] = await ds.query(
            `DELETE FROM coin_transactions WHERE idempotency_key LIKE 'seed:%' RETURNING user_id, amount`,
        );
        for (const row of deletedRows) {
            deletedSumByUser.set(row.user_id, (deletedSumByUser.get(row.user_id) ?? 0) + Number(row.amount));
        }
        console.log(`  RESET  ${deletedRows.length} Seed-Coin-Transaktionen geloescht`);
    }

    const allUsers: { id: string; nickname: string }[] = await ds.query(
        `SELECT u.id, p.nickname FROM users u JOIN profiles p ON p.user_id = u.id ORDER BY p.nickname`,
    );
    const alreadySeeded: { user_id: string }[] = await ds.query(
        `SELECT DISTINCT user_id FROM coin_transactions WHERE idempotency_key LIKE 'seed:%'`,
    );
    const seededUserIds = new Set(alreadySeeded.map(r => r.user_id));
    const targetUsers = allUsers.filter(u => !seededUserIds.has(u.id));

    if (targetUsers.length === 0) {
        console.log(`seed-coin-transactions: SKIP  alle ${allUsers.length} User haben bereits Seed-Coin-Transaktionen`);
        await ds.destroy();
        return;
    }

    const existingBalances: { user_id: string; balance: number }[] = await ds.query(
        `SELECT user_id, balance FROM user_coin_balance WHERE user_id = ANY($1)`,
        [targetUsers.map(u => u.id)],
    );
    const existingBalanceByUser = new Map(existingBalances.map(r => [r.user_id, Number(r.balance)]));

    const txRows: unknown[][] = [];
    const finalBalances = new Map<string, number>();

    for (const user of targetUsers) {
        const rng = createRng(seedFromString(`${user.nickname}:coin`));
        // Basis fuer den Non-Negativ-Clamp: bereits vorhandene Balance minus
        // dem, was ein SEED_RESET gerade an Seed-Transaktionen entfernt hat.
        let sum = (existingBalanceByUser.get(user.id) ?? 0) - (deletedSumByUser.get(user.id) ?? 0);

        for (let i = 1; i <= SEED_TX_PER_USER; i++) {
            const type = randomChoice(rng, COIN_TX_TYPES);
            let amount = randomCoinAmount(rng, type);
            // user_coin_balance hat CHECK balance >= 0 — negative Betraege
            // duerfen den bis hierhin aufgelaufenen Betrag nicht unterschreiten.
            if (amount < 0 && -amount > sum) amount = -sum;
            const daysAgo = randomInt(rng, 0, 180);
            const secondsAgo = randomInt(rng, 0, 86399);
            const createdAt = new Date(Date.now() - daysAgo * 86400000 - secondsAgo * 1000);

            txRows.push([user.id, amount, type, null, `seed:${user.id}:${i}`, createdAt.toISOString()]);
            sum += amount;
        }

        finalBalances.set(user.id, sum);
    }

    // coin_transactions + user_coin_balance muessen atomar zusammen entstehen —
    // sonst hinterlaesst ein Fehler Transaktionen ohne passende Balance, und der
    // naechste Lauf uebersieht den User (idempotency_key existiert ja schon).
    await ds.transaction(async manager => {
        const tx = buildBulkInsert(txRows);
        await manager.query(
            `INSERT INTO coin_transactions (user_id, amount, type, beef_id, idempotency_key, created_at)
             VALUES ${tx.placeholders}`,
            tx.params,
        );

        const balances = buildBulkInsert([...finalBalances.entries()].map(([userId, balance]) => [userId, balance]));
        await manager.query(
            `INSERT INTO user_coin_balance (user_id, balance)
             VALUES ${balances.placeholders}
             ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance`,
            balances.params,
        );
    });

    await ds.destroy();
    console.log(`seed-coin-transactions: ${targetUsers.length} User bekamen je ${SEED_TX_PER_USER} Transaktionen (${allUsers.length - targetUsers.length} bereits vorhanden).`);
}

main().catch(err => {
    console.error('seed-coin-transactions: Fehler:', err.message);
    process.exit(1);
});
