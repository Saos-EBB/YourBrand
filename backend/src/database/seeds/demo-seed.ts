/**
 * Demo-User Seed
 * Ausfuehren: npx ts-node -r tsconfig-paths/register src/database/seeds/demo-seed.ts
 *
 * Liest demo-users.yaml ein und legt User + Profile an.
 * Bereits vorhandene Nicknames/Emails werden uebersprungen (idempotent).
 *
 * Media (Fotos + Audio):
 *   DEMO_MEDIA_PATH=/pfad/zu/DemoScriptData npx ts-node ...
 *   Erwartet Unterordner: demoPfp/ und demoAudio/
 *   Laedt Dateien ins Object Storage hoch (siehe common/storage/object-storage.helper.ts,
 *   S3_*-Env-Vars) und legt media_uploads-Eintraege (moderation_status=approved) an.
 *
 *   Hinweis: file_url beginnt mit S3_PUBLIC_URL_BASE. Falls die DB eine
 *   https://-Constraint auf media_uploads.file_url hat, muss S3_PUBLIC_URL_BASE
 *   auf https:// zeigen oder die Constraint temporaer deaktiviert werden.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { encryptField, hashEmail } from '../../common/crypto/crypto.helper';
import { uploadObject } from '../../common/storage/object-storage.helper';

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

// Interest can be a plain string (green by default) or an object with explicit is_green
type InterestEntry = string | { name: string; is_green: boolean };

interface DemoUser {
    id: string;
    email: string;
    password: string;
    role: string;
    is_verified: boolean;
    nickname: string;
    birthdate: string;
    gender: string;
    looking_for: string;
    bio: string;
    city: string;
    status: string;
    photo_file?: string;   // Dateiname in $DEMO_MEDIA_PATH/demoPfp/
    audio_file?: string;   // Dateiname in $DEMO_MEDIA_PATH/demoAudio/
    interests: InterestEntry[];
}

interface SeedFile {
    users: DemoUser[];
}

// ---------------------------------------------------------------------------
// DB-Verbindung (gleiche Konfiguration wie data-source.ts)
// ---------------------------------------------------------------------------

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

const demoMediaPath = process.env.DEMO_MEDIA_PATH ?? '';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

async function getOrCreateInterest(ds: DataSource, name: string): Promise<string> {
    const existing = await ds.query(
        `SELECT id FROM interests WHERE LOWER(name_de) = LOWER($1) LIMIT 1`,
        [name],
    );
    if (existing.length > 0) return existing[0].id;

    const created = await ds.query(
        `INSERT INTO interests (id, name_de)
         VALUES (uuid_generate_v4(), $1)
         RETURNING id`,
        [name],
    );
    return created[0].id;
}

const MIME_BY_EXT: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.webm': 'audio/webm',
};

/**
 * Laedt eine Mediendatei ins Object Storage hoch und legt einen
 * media_uploads-Eintrag an. Gibt die neue media_id zurueck, oder null
 * wenn die Quelldatei nicht existiert.
 */
async function seedMediaFile(
    ds: DataSource,
    userId: string,
    srcPath: string,
    fileType: 'image' | 'audio',
    uploadSubDir: string,
): Promise<string | null> {
    if (!fs.existsSync(srcPath)) {
        console.warn(`    WARN  Media nicht gefunden: ${srcPath}`);
        return null;
    }

    const filename    = path.basename(srcPath);
    const contentType = MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
    const buffer       = fs.readFileSync(srcPath);
    const fileUrl      = await uploadObject(`${uploadSubDir}/${filename}`, buffer, contentType);
    const fileSizeKb   = Math.ceil(buffer.length / 1024);

    const result = await ds.query(
        `INSERT INTO media_uploads
            (id, uploaded_by, file_url, file_type, file_use_for, context,
             conversation_id, org_id, moderation_status, is_encrypted,
             file_size_kb, needs_review, uploaded_at)
         VALUES
            (uuid_generate_v4(), $1, $2, $3, $4, 'profile',
             NULL, NULL, 'approved', false,
             $5, false, NOW())
         RETURNING id`,
        [
            userId,
            fileUrl,
            fileType,
            fileType === 'image' ? 'profile_photo' : 'profile_audio',
            fileSizeKb,
        ],
    );
    return result[0].id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const yamlPath = path.join(__dirname, 'demo-users.yaml');
    const seed = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as SeedFile;

    await ds.initialize();
    console.log('Verbunden mit DB:', process.env.DB_NAME);

    if (demoMediaPath) {
        console.log('Demo-Media-Pfad:', demoMediaPath);
    } else {
        console.log('DEMO_MEDIA_PATH nicht gesetzt — Media wird uebersprungen');
    }

    // Constraint auf media_uploads.file_url erfordert https://.
    // Im lokalen Dev-Betrieb (S3_PUBLIC_URL_BASE=http://... fuer MinIO) wird sie temporaer entfernt.
    const needsConstraintDrop = !(process.env.S3_PUBLIC_URL_BASE ?? '').startsWith('https://');
    if (needsConstraintDrop && demoMediaPath) {
        await ds.query(`ALTER TABLE media_uploads DROP CONSTRAINT IF EXISTS chk_media_file_url`);
        console.log('  INFO  chk_media_file_url temporaer entfernt (http-URL in dev)');
    }

    let created = 0;
    let skipped = 0;

    for (const u of seed.users) {
        // --- Pruefen ob Nickname schon existiert ---
        const existing = await ds.query(
            `SELECT id FROM profiles WHERE nickname = $1 LIMIT 1`,
            [u.nickname],
        );
        if (existing.length > 0) {
            console.log(`  SKIP  ${u.nickname} (schon vorhanden)`);
            skipped++;
            continue;
        }

        // --- User anlegen ---
        const emailHash    = hashEmail(u.email);
        const emailCrypt   = encryptField(u.email);
        const passwordHash = await bcrypt.hash(u.password, 12);

        const userResult = await ds.query(
            `INSERT INTO users (
                id, email, email_search_hash, password_hash,
                role, is_verified, email_verified_at,
                created_at, last_login
             ) VALUES (
                uuid_generate_v4(), $1, $2, $3,
                $4, $5, $6,
                NOW(), NOW()
             ) RETURNING id`,
            [
                emailCrypt,
                emailHash,
                passwordHash,
                u.role ?? 'user',
                u.is_verified ?? true,
                u.is_verified ? new Date() : null,
            ],
        );
        const userId: string = userResult[0].id;

        // --- public_id generieren (6 Zeichen, unique) ---
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let publicId = '';
        for (let i = 0; i < 6; i++) publicId += chars[Math.floor(Math.random() * chars.length)];
        await ds.query(`UPDATE users SET public_id = $1 WHERE id = $2`, [publicId, userId]);

        // --- Profil anlegen ---
        // saos43 bleibt bewusst un-onboarded (Test-Account fuer den Onboarding-Flow).
        const isOnboarded = u.nickname !== 'saos43';

        await ds.query(
            `INSERT INTO profiles (
                id, user_id, nickname, birthdate, bio, city,
                gender, looking_for, status_message,
                is_published, onboarding_completed,
                show_bio, show_city, show_age, show_gender,
                show_interests, show_audio,
                profanity_filter, status_visible,
                updated_at
             ) VALUES (
                uuid_generate_v4(), $1, $2, $3, $4, $5,
                $6, $7, $8,
                $9, $9,
                true, true, true, true,
                true, true,
                true, true,
                NOW()
             )`,
            [
                userId,
                u.nickname,
                u.birthdate,
                u.bio?.trim() || null,
                u.city ?? null,
                u.gender ?? null,
                u.looking_for ?? null,
                u.status ?? 'available',
                isOnboarded,
            ],
        );

        // --- Interessen anlegen ---
        if (u.interests?.length) {
            for (const entry of u.interests) {
                const name     = typeof entry === 'string' ? entry : entry.name;
                const is_green = typeof entry === 'string' ? true  : entry.is_green;
                const interestId = await getOrCreateInterest(ds, name);
                await ds.query(
                    `INSERT INTO user_interests (user_id, interest_id, is_green)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (user_id, interest_id) DO UPDATE SET is_green = EXCLUDED.is_green`,
                    [userId, interestId, is_green],
                );
            }
        }

        // --- Media (nur wenn DEMO_MEDIA_PATH gesetzt) ---
        if (demoMediaPath) {
            if (u.photo_file) {
                const src     = path.join(demoMediaPath, 'demoPfp', u.photo_file);
                const photoId = await seedMediaFile(ds, userId, src, 'image', 'profiles');
                if (photoId) {
                    await ds.query(
                        `UPDATE profiles SET photo_id = $1 WHERE user_id = $2`,
                        [photoId, userId],
                    );
                }
            }

            if (u.audio_file) {
                const src     = path.join(demoMediaPath, 'demoAudio', u.audio_file);
                const audioId = await seedMediaFile(ds, userId, src, 'audio', 'audio');
                if (audioId) {
                    await ds.query(
                        `UPDATE profiles SET audio_id = $1 WHERE user_id = $2`,
                        [audioId, userId],
                    );
                }
            }
        }

        console.log(`  OK    ${u.nickname} (${u.email}) → ${userId}`);
        created++;
    }

    // Constraint wiederherstellen (nur wenn S3_PUBLIC_URL_BASE https:// ist)
    if (needsConstraintDrop && demoMediaPath) {
        if ((process.env.S3_PUBLIC_URL_BASE ?? '').startsWith('https://')) {
            await ds.query(`ALTER TABLE media_uploads ADD CONSTRAINT chk_media_file_url CHECK (file_url ~ '^https://')`);
            console.log('  INFO  chk_media_file_url wiederhergestellt');
        } else {
            console.log('  WARN  chk_media_file_url bleibt entfernt — S3_PUBLIC_URL_BASE ist kein https://');
            console.log('        Manuell wiederherstellen: ALTER TABLE media_uploads ADD CONSTRAINT chk_media_file_url CHECK (file_url ~ \'^https://\')');
        }
    }

    await ds.destroy();
    console.log(`\nFertig: ${created} angelegt, ${skipped} uebersprungen.`);
}

main().catch(err => {
    console.error('Fehler:', err.message);
    process.exit(1);
});
