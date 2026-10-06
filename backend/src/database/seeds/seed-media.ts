/**
 * Media-Upload-Seed
 * Ausfuehren: SEED_MEDIA_PER_USER=3 npx ts-node -r tsconfig-paths/register src/database/seeds/seed-media.ts
 *
 * Legt fuer jeden User SEED_MEDIA_PER_USER media_uploads mit Fake-file_url
 * an (kein echtes File auf Disk, anders als demo-seed.ts). file_size_kb
 * zufaellig im per CHECK erlaubten Bereich (1-51200), moderation_status
 * gewichtet 50% pending / 30% approved / 20% rejected. approved/rejected
 * bekommen reviewed_at/reviewed_by (erster admin/owner-User) gesetzt,
 * rejected zusaetzlich eine review_rejected_reason — analog zu admin.service.ts
 * approveMedia()/rejectMedia().
 *
 * Idempotent: file_use_for = "seed_filler" markiert Seed-Zeilen. User mit
 * vorhandenen Seed-Media werden uebersprungen. SEED_RESET=true loescht alle
 * "seed_filler"-Zeilen und baut neu auf.
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';
import { createRng, randomInt, weightedChoice, seedFromString, buildBulkInsert } from './seed-shared';
import { tenantInfra } from '../../common/tenant/tenant-infra.helper';

const ds = new DataSource({
    type: 'postgres',
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432', 10),
    database: tenantInfra().database,
    username: process.env.DB_USER     ?? '',
    password: process.env.DB_PASSWORD ?? '',
    synchronize: false,
    logging: false,
    extra: { options: '-c client_encoding=UTF8' },
});

const SEED_MEDIA_PER_USER = parseInt(process.env.SEED_MEDIA_PER_USER ?? '0', 10);
const SEED_RESET = (process.env.SEED_RESET ?? 'false').toLowerCase() === 'true';

const FILE_TYPES = ['image', 'audio'] as const;
const CONTEXTS = ['profile', 'chat', 'org'] as const;
const EXTENSION: Record<string, string> = { image: 'jpg', audio: 'mp3' };
const REJECTION_REASON = 'Seed-Testdaten — automatisch abgelehnt';

async function main() {
    if (SEED_MEDIA_PER_USER <= 0) {
        console.log('seed-media: SEED_MEDIA_PER_USER=0 — nichts zu tun');
        return;
    }

    await ds.initialize();
    console.log('seed-media: verbunden mit DB', tenantInfra().database);

    if (SEED_RESET) {
        const [deletedRows] = await ds.query(
            `DELETE FROM media_uploads WHERE file_use_for = 'seed_filler' RETURNING id`,
        );
        console.log(`  RESET  ${deletedRows.length} Seed-Media-Uploads geloescht`);
    }

    const [reviewer] = await ds.query(
        `SELECT id FROM users WHERE role IN ('admin', 'owner') ORDER BY created_at ASC LIMIT 1`,
    );
    const reviewerId: string | null = reviewer?.id ?? null;

    const allUsers: { id: string; nickname: string }[] = await ds.query(
        `SELECT u.id, p.nickname FROM users u JOIN profiles p ON p.user_id = u.id ORDER BY p.nickname`,
    );
    const alreadySeeded: { uploaded_by: string }[] = await ds.query(
        `SELECT DISTINCT uploaded_by FROM media_uploads WHERE file_use_for = 'seed_filler'`,
    );
    const seededUserIds = new Set(alreadySeeded.map(r => r.uploaded_by));
    const targetUsers = allUsers.filter(u => !seededUserIds.has(u.id));

    if (targetUsers.length === 0) {
        console.log(`seed-media: SKIP  alle ${allUsers.length} User haben bereits Seed-Media`);
        await ds.destroy();
        return;
    }

    const rows: unknown[][] = [];

    for (const user of targetUsers) {
        const rng = createRng(seedFromString(`${user.nickname}:media`));

        for (let i = 1; i <= SEED_MEDIA_PER_USER; i++) {
            const fileType = FILE_TYPES[Math.floor(rng() * FILE_TYPES.length)];
            const context = CONTEXTS[Math.floor(rng() * CONTEXTS.length)];
            const fileSizeKb = randomInt(rng, 1, 51200);
            const status = weightedChoice(rng, [['pending', 50], ['approved', 30], ['rejected', 20]] as const);
            const daysAgo = randomInt(rng, 0, 180);
            const uploadedAt = new Date(Date.now() - daysAgo * 86400000);

            const isReviewed = status !== 'pending';
            const reviewedAt = isReviewed
                ? new Date(uploadedAt.getTime() + randomInt(rng, 1, 72) * 3600000).toISOString()
                : null;
            const reviewedBy = isReviewed ? reviewerId : null;
            const rejectedReason = status === 'rejected' ? REJECTION_REASON : null;

            const fileUrl = `https://seed.local/uploads/seed/${user.id}-${i}.${EXTENSION[fileType]}`;

            rows.push([
                user.id, fileUrl, fileType, 'seed_filler', context,
                status, false, fileSizeKb, uploadedAt.toISOString(),
                !isReviewed, reviewedAt, reviewedBy, rejectedReason,
            ]);
        }
    }

    const media = buildBulkInsert(rows);
    await ds.query(
        `INSERT INTO media_uploads
            (uploaded_by, file_url, file_type, file_use_for, context,
             moderation_status, is_encrypted, file_size_kb, uploaded_at,
             needs_review, reviewed_at, reviewed_by, review_rejected_reason)
         VALUES ${media.placeholders}`,
        media.params,
    );

    await ds.destroy();
    console.log(`seed-media: ${targetUsers.length} User bekamen je ${SEED_MEDIA_PER_USER} Media-Uploads (${allUsers.length - targetUsers.length} bereits vorhanden).`);
}

main().catch(err => {
    console.error('seed-media: Fehler:', err.message);
    process.exit(1);
});
