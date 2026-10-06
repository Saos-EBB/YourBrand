/**
 * Demo-Relations Seed
 * Ausfuehren: npx ts-node -r tsconfig-paths/register src/database/seeds/demo-relations-seed.ts
 *
 * Liest demo-relations.yaml ein und legt an:
 *   - contact_requests  (Verbindungen, pending, declined)
 *   - conversations     (fuer accepted requests mit messages)
 *   - messages          (Chat-Inhalte mit realistischen Timestamps)
 *   - beefs             (5 Beefs mit verschiedenen Status)
 *   - blocks            (Makima blockt 3 User)
 *
 * Idempotent: bereits vorhandene Eintraege werden uebersprungen.
 * Voraussetzung: demo-seed.ts wurde bereits ausgefuehrt (User + Profile vorhanden).
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { demoSeedPath } from './demo-seed-path';
import { DataSource } from 'typeorm';
import { tenantInfra } from '../../common/tenant/tenant-infra.helper';

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

interface ContactRequest {
  sender: string;
  receiver: string;
  status: 'pending' | 'accepted' | 'declined';
  message_preview?: string;
}

interface Message {
  sender: string;
  content: string;
  minutes_ago: number;
}

interface Conversation {
  user_a: string;
  user_b: string;
  contact_request_ref?: string;
  status?: string;
  messages: Message[];
}

interface Beef {
  initiator: string;
  target: string;
  tldr: string;
  chat_passage: string;
  status: string;
  admin_approved: boolean;
  game_type: string;
  pot_coins: number;
  winner?: string;
}

interface Block {
  blocker: string;
  blocked: string;
  reason?: string;
}

interface BeefVoteEntry {
  voter: string;
  side: 'initiator' | 'target';
  coins_wagered?: number;
}

interface BeefCommentEntry {
  user: string;
  content: string;
  minutes_ago: number;
}

interface BeefInteraction {
  beef_initiator: string;
  beef_target: string;
  votes: BeefVoteEntry[];
  comments: BeefCommentEntry[];
}

interface SeedFile {
  contact_requests: ContactRequest[];
  conversations: Conversation[];
  beefs: Beef[];
  blocks: Block[];
  beef_interactions?: BeefInteraction[];
}

// ---------------------------------------------------------------------------
// DB-Verbindung
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Nickname → user_id lookup.
 * Wirft einen Fehler wenn der Nickname nicht gefunden wird.
 */
async function getUserId(nickname: string): Promise<string> {
  const rows = await ds.query(
    `SELECT u.id FROM users u
     JOIN profiles p ON p.user_id = u.id
     WHERE p.nickname = $1
     LIMIT 1`,
    [nickname],
  );
  if (!rows.length) throw new Error(`User nicht gefunden: "${nickname}"`);
  return rows[0].id;
}

/**
 * Prueft ob ein contact_request zwischen zwei Usern bereits existiert.
 * Richtungsunabhaengig: (a,b) oder (b,a).
 */
async function getExistingRequest(
  senderId: string,
  receiverId: string,
): Promise<{ id: string; status: string } | null> {
  const rows = await ds.query(
    `SELECT id, status FROM contact_requests
     WHERE (sender_id = $1 AND receiver_id = $2)
        OR (sender_id = $2 AND receiver_id = $1)
     LIMIT 1`,
    [senderId, receiverId],
  );
  return rows.length ? rows[0] : null;
}

/**
 * Prueft ob eine Conversation zwischen zwei Usern bereits existiert.
 * Richtungsunabhaengig.
 */
async function getExistingConversation(
  userAId: string,
  userBId: string,
): Promise<string | null> {
  const rows = await ds.query(
    `SELECT id FROM conversations
     WHERE (user_a_id = $1 AND user_b_id = $2)
        OR (user_a_id = $2 AND user_b_id = $1)
     LIMIT 1`,
    [userAId, userBId],
  );
  return rows.length ? rows[0].id : null;
}

// ---------------------------------------------------------------------------
// Seed-Funktionen
// ---------------------------------------------------------------------------

async function seedContactRequests(
  requests: ContactRequest[],
): Promise<Map<string, string>> {
  // Gibt eine Map zurueck: "senderNick→receiverNick" → contact_request_id
  // Wird spaeter fuer Conversations benoetigt
  const requestIdMap = new Map<string, string>();

  console.log('\n── Contact Requests ──────────────────────────────────');
  let created = 0;
  let skipped = 0;

  for (const r of requests) {
    const senderId   = await getUserId(r.sender);
    const receiverId = await getUserId(r.receiver);

    const existing = await getExistingRequest(senderId, receiverId);

    if (existing) {
      // Wenn vorhanden aber status unterschiedlich → update auf neuen status
      if (existing.status !== r.status) {
        await ds.query(
          `UPDATE contact_requests
           SET status = $1, responded_at = NOW()
           WHERE id = $2`,
          [r.status, existing.id],
        );
        console.log(`  UPD   ${r.sender} → ${r.receiver} (${existing.status} → ${r.status})`);
      } else {
        console.log(`  SKIP  ${r.sender} → ${r.receiver} (${r.status})`);
      }
      requestIdMap.set(`${r.sender}→${r.receiver}`, existing.id);
      requestIdMap.set(`${r.receiver}→${r.sender}`, existing.id);
      skipped++;
      continue;
    }

    const result = await ds.query(
      `INSERT INTO contact_requests
         (id, sender_id, receiver_id, status, message_preview, responded_at, created_at)
       VALUES
         (uuid_generate_v4(), $1, $2, $3::request_status, $4,
          $5,
          NOW() - (random() * interval '7 days'))
       RETURNING id`,
      [
        senderId,
        receiverId,
        r.status,
        r.message_preview ?? null,
        // responded_at nur setzen wenn nicht pending
        r.status !== 'pending' ? new Date() : null,
      ],
    );

    const reqId = result[0].id;
    requestIdMap.set(`${r.sender}→${r.receiver}`, reqId);
    requestIdMap.set(`${r.receiver}→${r.sender}`, reqId);

    console.log(`  OK    ${r.sender} → ${r.receiver} (${r.status})`);
    created++;
  }

  console.log(`  → ${created} angelegt, ${skipped} uebersprungen/aktualisiert`);
  return requestIdMap;
}

async function seedConversations(
  conversations: Conversation[],
  requestIdMap: Map<string, string>,
): Promise<void> {
  console.log('\n── Conversations + Messages ──────────────────────────');
  let convCreated = 0;
  let convSkipped = 0;
  let msgCreated  = 0;

  for (const c of conversations) {
    const userAId = await getUserId(c.user_a);
    const userBId = await getUserId(c.user_b);

    // contact_request_id ermitteln — PFLICHTFELD (NOT NULL in DB)
    // Suche in requestIdMap nach beiden Richtungen
    let contactRequestId: string | null =
      requestIdMap.get(`${c.user_a}→${c.user_b}`) ??
      requestIdMap.get(`${c.user_b}→${c.user_a}`) ??
      null;

    // Fallback: direkt in DB suchen
    if (!contactRequestId) {
      const existing = await getExistingRequest(userAId, userBId);
      if (existing) contactRequestId = existing.id;
    }

    if (!contactRequestId) {
      console.warn(`  WARN  Kein Contact Request fuer ${c.user_a} ↔ ${c.user_b} — uebersprungen`);
      convSkipped++;
      continue;
    }

    // Conversation pruefen
    const existingConvId = await getExistingConversation(userAId, userBId);
    let conversationId: string;

    if (existingConvId) {
      console.log(`  SKIP  Conversation ${c.user_a} ↔ ${c.user_b} (schon vorhanden)`);
      conversationId = existingConvId;
      convSkipped++;
    } else {
      // last_message_at = Timestamp der letzten Message
      const lastMsg = c.messages.reduce(
        (min, m) => m.minutes_ago < min ? m.minutes_ago : min,
        Infinity,
      );
      const lastMessageAt = new Date(Date.now() - lastMsg * 60 * 1000);

      const result = await ds.query(
        `INSERT INTO conversations
           (id, user_a_id, user_b_id, contact_request_id, status,
            images_enabled, audio_enabled, video_enabled,
            last_message_at, created_at)
         VALUES
           (uuid_generate_v4(), $1, $2, $3, $4::conversation_status,
            true, true, true,
            $5, NOW() - interval '30 days')
         RETURNING id`,
        [userAId, userBId, contactRequestId, c.status ?? 'active', lastMessageAt],
      );
      conversationId = result[0].id;
      console.log(`  OK    Conversation ${c.user_a} ↔ ${c.user_b}`);
      convCreated++;
    }

    // Messages seeden — nur wenn Conversation neu oder keine Messages vorhanden
    const existingMsgCount = await ds.query(
      `SELECT COUNT(*) FROM messages WHERE conversation_id = $1`,
      [conversationId],
    );
    if (parseInt(existingMsgCount[0].count) > 0) {
      console.log(`         Messages vorhanden — uebersprungen`);
      continue;
    }

    for (const m of c.messages) {
      const senderId  = await getUserId(m.sender);
      const sentAt    = new Date(Date.now() - m.minutes_ago * 60 * 1000);

      await ds.query(
        `INSERT INTO messages
           (id, conversation_id, sender_id, content, type, sent_at)
         VALUES
           (uuid_generate_v4(), $1, $2, $3, 'text'::message_type, $4)`,
        [conversationId, senderId, m.content, sentAt],
      );
      msgCreated++;
    }

    console.log(`         ${c.messages.length} Messages angelegt`);
  }

  console.log(`  → ${convCreated} Conversations angelegt, ${convSkipped} uebersprungen, ${msgCreated} Messages total`);
}

async function seedBeefs(beefs: Beef[]): Promise<void> {
  console.log('\n── Beefs ─────────────────────────────────────────────');
  let created = 0;
  let skipped = 0;

  for (const b of beefs) {
    const initiatorId = await getUserId(b.initiator);
    const targetId    = await getUserId(b.target);

    // Idempotenz: pruefen per (initiator_id, target_id, tldr)
    const existing = await ds.query(
      `SELECT id FROM beefs
       WHERE initiator_id = $1 AND target_id = $2 AND tldr = $3
       LIMIT 1`,
      [initiatorId, targetId, b.tldr],
    );

    if (existing.length) {
      console.log(`  SKIP  Beef "${b.tldr}" (schon vorhanden)`);
      skipped++;
      continue;
    }

    const winnerId = b.winner ? await getUserId(b.winner) : null;

    // ends_at: fuer active Beefs 8h in der Zukunft, fuer closed/chickened in der Vergangenheit
    let endsAt: Date | null = null;
    if (b.status === 'active') {
      endsAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    } else if (b.status === 'waiting') {
      endsAt = new Date(Date.now() + 20 * 60 * 60 * 1000); // 20h fuer Acceptance-Window
    } else if (b.status === 'closed' || b.status === 'chickened') {
      endsAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // bereits abgelaufen
    }

    await ds.query(
      `INSERT INTO beefs
         (id, initiator_id, target_id, tldr, chat_passage,
          status, admin_approved, winner_id,
          ends_at, game_type, pot_coins, created_at)
       VALUES
         (uuid_generate_v4(), $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, $10,
          NOW() - interval '1 day')`,
      [
        initiatorId,
        targetId,
        b.tldr,
        b.chat_passage,
        b.status,
        b.admin_approved,
        winnerId,
        endsAt,
        b.game_type ?? 'rps',
        b.pot_coins ?? 0,
      ],
    );

    console.log(`  OK    Beef "${b.tldr}" (${b.initiator} vs ${b.target}, status: ${b.status})`);
    created++;
  }

  console.log(`  → ${created} angelegt, ${skipped} uebersprungen`);
}

async function seedBeefInteractions(interactions: BeefInteraction[]): Promise<void> {
  console.log('\n── Beef Votes + Comments ─────────────────────────────');
  let votesCreated   = 0;
  let votesSkipped   = 0;
  let commentsCreated = 0;
  let commentsSkipped = 0;

  for (const entry of interactions) {
    const initiatorId = await getUserId(entry.beef_initiator);
    const targetId    = await getUserId(entry.beef_target);

    const beefRows = await ds.query(
      `SELECT id FROM beefs WHERE initiator_id = $1 AND target_id = $2 LIMIT 1`,
      [initiatorId, targetId],
    );
    if (!beefRows.length) {
      console.warn(`  WARN  Beef ${entry.beef_initiator} vs ${entry.beef_target} nicht gefunden — uebersprungen`);
      continue;
    }
    const beefId = beefRows[0].id;

    for (const v of entry.votes) {
      const voterId = await getUserId(v.voter);
      const existing = await ds.query(
        `SELECT id FROM beef_votes WHERE beef_id = $1 AND voter_id = $2 LIMIT 1`,
        [beefId, voterId],
      );
      if (existing.length) {
        votesSkipped++;
        continue;
      }
      await ds.query(
        `INSERT INTO beef_votes (id, beef_id, voter_id, side, coins_wagered, created_at)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW() - (random() * interval '20 hours'))`,
        [beefId, voterId, v.side, v.coins_wagered ?? 1],
      );
      votesCreated++;
    }

    for (const c of entry.comments) {
      const userId = await getUserId(c.user);
      const existing = await ds.query(
        `SELECT id FROM beef_comments WHERE beef_id = $1 AND user_id = $2 LIMIT 1`,
        [beefId, userId],
      );
      if (existing.length) {
        commentsSkipped++;
        continue;
      }
      const createdAt = new Date(Date.now() - c.minutes_ago * 60 * 1000);
      await ds.query(
        `INSERT INTO beef_comments (id, beef_id, user_id, content, created_at)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4)`,
        [beefId, userId, c.content, createdAt],
      );
      commentsCreated++;
    }

    console.log(`  OK    ${entry.beef_initiator} vs ${entry.beef_target}: ${entry.votes.length} Votes, ${entry.comments.length} Comments`);
  }

  console.log(`  → ${votesCreated} Votes angelegt, ${votesSkipped} uebersprungen`);
  console.log(`  → ${commentsCreated} Comments angelegt, ${commentsSkipped} uebersprungen`);
}

async function seedBlocks(blocks: Block[]): Promise<void> {
  console.log('\n── Blocks ────────────────────────────────────────────');
  let created = 0;
  let skipped = 0;

  for (const b of blocks) {
    const blockerId = await getUserId(b.blocker);
    const blockedId = await getUserId(b.blocked);

    const existing = await ds.query(
      `SELECT id FROM blocks
       WHERE blocker_id = $1 AND blocked_id = $2
       LIMIT 1`,
      [blockerId, blockedId],
    );

    if (existing.length) {
      console.log(`  SKIP  ${b.blocker} blocks ${b.blocked} (schon vorhanden)`);
      skipped++;
      continue;
    }

    await ds.query(
      `INSERT INTO blocks (id, blocker_id, blocked_id, reason, created_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, NOW())`,
      [blockerId, blockedId, b.reason ?? null],
    );

    console.log(`  OK    ${b.blocker} blocks ${b.blocked}`);
    created++;
  }

  console.log(`  → ${created} angelegt, ${skipped} uebersprungen`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Mandanten-Datensatz (tenant.json "seed") oder die mitgelieferte Datei.
  const yamlPath = demoSeedPath('demo-relations.yaml');
  if (!yamlPath) {
    console.log('Kein demo-relations.yaml fuer diesen Mandanten — uebersprungen');
    return;
  }
  const raw = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as Partial<SeedFile>;
  // Mandanten-Datensaetze lassen Abschnitte weg (z.B. keine Beefs ohne Hidden Zone).
  const seed: SeedFile = {
    contact_requests: raw.contact_requests ?? [],
    conversations: raw.conversations ?? [],
    beefs: raw.beefs ?? [],
    blocks: raw.blocks ?? [],
    beef_interactions: raw.beef_interactions ?? [],
  };

  await ds.initialize();
  console.log('Verbunden mit DB:', tenantInfra().database);
  console.log('Starte Demo-Relations Seed...');

  // Reihenfolge ist wichtig:
  // 1. Contact Requests zuerst (Conversations + Beefs brauchen sie)
  // 2. Conversations (brauchen contact_request_id)
  // 3. Beefs (brauchen nur user_ids)
  // 4. Blocks (unabhaengig)

  const requestIdMap = await seedContactRequests(seed.contact_requests);
  await seedConversations(seed.conversations, requestIdMap);
  await seedBeefs(seed.beefs);
  await seedBlocks(seed.blocks);
  if (seed.beef_interactions?.length) {
    await seedBeefInteractions(seed.beef_interactions);
  }

  await ds.destroy();
  console.log('\nFertig ✓');
}

main().catch(err => {
  console.error('\nFehler:', err.message);
  process.exit(1);
});
