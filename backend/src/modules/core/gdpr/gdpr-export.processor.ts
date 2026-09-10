import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import PDFDocument from 'pdfkit';
import { decryptField } from '../../../common/crypto/crypto.helper';
import { MailService } from '../../../common/mail/mail.service';
import { GDPR_EXPORT_QUEUE } from '../../../common/queue/queue.constants';

const M = 50;

interface GenerateExportJob {
    userId: string;
}

// Registered as a provider ONLY in WorkerModule. Moved wholesale from
// gdpr.service.ts, which used to run all of this (15 queries + ~300 lines of
// pdfkit layout) inline on the request, blocking the event loop.
@Processor(GDPR_EXPORT_QUEUE)
export class GdprExportProcessor extends WorkerHost {
    private readonly logger = new Logger(GdprExportProcessor.name);

    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly mailService: MailService,
    ) {
        super();
    }

    async process(job: Job<GenerateExportJob>): Promise<void> {
        const { userId } = job.data;

        const [
            userRows,
            profileRows,
            sensitiveRows,
            consentRows,
            interestRows,
            mediaRows,
            subscriptionRows,
            paymentRows,
            messageRows,
            notifRows,
            contactSentRows,
            contactReceivedRows,
            blockRows,
            reportRows,
            strikeRows,
        ] = await Promise.all([
            this.dataSource.query(
                `SELECT role, is_verified, is_banned, ban_reason, ban_expires_at,
                        vulnerable_flag, enhanced_protection, created_at, last_login, email
                 FROM users WHERE id = $1`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT nickname, bio, city, birthdate, search_radius_km, is_published,
                        lang_simple, font_size, high_contrast, onboarding_completed,
                        gender, looking_for, profanity_filter, status_visible, status_message,
                        show_bio, show_city, show_age, show_gender, show_interests, show_audio,
                        updated_at
                 FROM profiles WHERE user_id = $1`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT disability_type, disability_visible, collected_at, updated_at
                 FROM profile_sensitive_data WHERE user_id = $1`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT cl.accepted_at, cl.withdrawn_at, av.version, av.type
                 FROM consent_logs cl
                 JOIN agb_versions av ON av.id = cl.agb_version_id
                 WHERE cl.user_id = $1
                 ORDER BY cl.accepted_at DESC`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT i.name_de, i.category
                 FROM user_interests ui JOIN interests i ON i.id = ui.interest_id
                 WHERE ui.user_id = $1
                 ORDER BY i.category, i.name_de`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT file_type, moderation_status, uploaded_at, deleted_at
                 FROM media_uploads WHERE uploaded_by = $1 ORDER BY uploaded_at ASC`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT plan, status, started_at, expires_at, cancelled_at
                 FROM subscriptions WHERE user_id = $1 ORDER BY started_at DESC`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT amount, currency, status, created_at
                 FROM payment_logs WHERE user_id = $1 ORDER BY created_at DESC`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT content, type, sent_at, is_deleted
                 FROM messages WHERE sender_id = $1 ORDER BY sent_at DESC LIMIT 100`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT email_messages, email_matches, email_system,
                        push_messages, push_matches, push_system
                 FROM notification_settings WHERE user_id = $1`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT status, created_at FROM contact_requests WHERE sender_id = $1 ORDER BY created_at DESC`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT status, created_at FROM contact_requests WHERE receiver_id = $1 ORDER BY created_at DESC`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT created_at FROM blocks WHERE blocker_id = $1 ORDER BY created_at DESC`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT reason, description, status, created_at
                 FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC`,
                [userId],
            ),
            this.dataSource.query(
                `SELECT type, reason, created_at, expires_at
                 FROM strikes WHERE user_id = $1 ORDER BY created_at DESC`,
                [userId],
            ),
        ]);

        const buffer = await this.buildPdf(
            userRows, profileRows, sensitiveRows, consentRows, interestRows,
            mediaRows, subscriptionRows, paymentRows, messageRows, notifRows,
            contactSentRows, contactReceivedRows, blockRows, reportRows, strikeRows,
        );

        const email = decryptField(userRows[0]?.email ?? null);
        if (!email) {
            // No email on file (e.g. a future Google-only account — not
            // reachable via any current registration path, but the schema
            // allows it via chk_users_login_method). Nothing to deliver to.
            this.logger.warn(`GDPR-Export für ${userId}: keine Email hinterlegt, Mail übersprungen`);
            return;
        }

        await this.mailService.sendGdprExportEmail(email, buffer);

        await this.dataSource.query(
            'UPDATE users SET last_gdpr_export_at = NOW() WHERE id = $1',
            [userId],
        );
    }

    private buildPdf(
        userRows: any[], profileRows: any[], sensitiveRows: any[], consentRows: any[],
        interestRows: any[], mediaRows: any[], subscriptionRows: any[], paymentRows: any[],
        messageRows: any[], notifRows: any[], contactSentRows: any[], contactReceivedRows: any[],
        blockRows: any[], reportRows: any[], strikeRows: any[],
    ): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', margin: M, autoFirstPage: true, bufferPages: true });
            const chunks: Buffer[] = [];

            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const pageW = doc.page.width - M * 2;

            const fmt = (d: Date | string | null | undefined): string =>
                d ? new Date(d as string).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '—';

            const bool = (v: boolean | null | undefined): string => v ? 'Ja' : 'Nein';

            const trunc = (val: string | null | undefined, max = 300): string => {
                if (!val) return '—';
                const s = String(val);
                return s.length > max ? s.slice(0, max) + '…' : s;
            };

            // Title page
            doc.fontSize(24).fillColor('#111827').text('Ihre persönlichen Daten', M, doc.page.margins.top, { width: pageW });
            doc.moveDown(0.5);
            doc.fontSize(11).fillColor('#6b7280').text(
                `Export erstellt am ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
                { width: pageW },
            );
            doc.moveDown(1);
            doc.strokeColor('#73db9a').lineWidth(2).moveTo(M, doc.y).lineTo(M + pageW, doc.y).stroke();
            doc.moveDown(1);
            doc.fontSize(10).fillColor('#374151').text(
                'Dieses Dokument enthält alle personenbezogenen Daten, die Paarship zu Ihrem Konto ' +
                'gespeichert hat. Es wurde gemäß Art. 15 DSGVO erstellt.',
                { width: pageW },
            );

            const section = (title: string) => {
                const spaceNeeded = 80;
                if (doc.y + spaceNeeded > doc.page.height - doc.page.margins.bottom) {
                    doc.addPage();
                } else {
                    doc.moveDown(1.2);
                }
                const headerY = doc.y;
                doc.rect(M, headerY, pageW, 22).fill('#f0fdf4');
                doc.fontSize(12).fillColor('#111827')
                   .text(title, M + 8, headerY + 5, { width: pageW - 16 });
                doc.y = headerY + 28;
                doc.strokeColor('#73db9a').lineWidth(1)
                   .moveTo(M, doc.y).lineTo(M + pageW, doc.y).stroke();
                doc.moveDown(0.4);
            };

            const kv = (label: string, value: string | null | undefined) => {
                if (doc.y + 20 > doc.page.height - doc.page.margins.bottom) {
                    doc.addPage();
                }
                const startY = doc.y;
                doc.fontSize(10).fillColor('#6b7280').text(label + ':', M, startY, { width: 160 });
                const afterLabel = doc.y;
                doc.fontSize(10).fillColor('#1f2937').text(String(value ?? '—'), M + 165, startY, { width: pageW - 165 });
                doc.y = Math.max(afterLabel, doc.y);
                doc.moveDown(0.1);
            };

            const subheading = (text: string) => {
                doc.moveDown(0.3);
                doc.fontSize(11).fillColor('#374151').text(text, M, doc.y, { width: pageW });
                doc.moveDown(0.2);
            };

            const empty = (msg: string) => {
                doc.fontSize(10).fillColor('#6b7280').text(msg, M, doc.y, { width: pageW });
            };

            // 1. Account
            section('1. Kontodaten');
            const u = userRows[0] ?? {};
            kv('E-Mail', decryptField(u.email) ?? '—');
            kv('Rolle', u.role);
            kv('E-Mail bestätigt', bool(u.is_verified));
            kv('Konto gesperrt', bool(u.is_banned));
            if (u.is_banned) {
                kv('Sperrgrund', trunc(u.ban_reason));
                kv('Gesperrt bis', fmt(u.ban_expires_at));
            }
            kv('Schutz-Flag', bool(u.vulnerable_flag));
            kv('Erweiterter Schutz', bool(u.enhanced_protection));
            kv('Registriert am', fmt(u.created_at));
            kv('Letzter Login', fmt(u.last_login));

            // 2. Profil
            section('2. Profil');
            const p = profileRows[0] ?? {};
            kv('Nickname', p.nickname);
            kv('Biografie', trunc(p.bio, 500));
            kv('Wohnort', p.city);
            kv('Geburtsdatum', p.birthdate ? new Date(p.birthdate).toLocaleDateString('de-DE') : '—');
            kv('Bio anzeigen', bool(p.show_bio));
            kv('Stadt anzeigen', bool(p.show_city));
            kv('Alter anzeigen', bool(p.show_age));
            kv('Geschlecht anzeigen', bool(p.show_gender));
            kv('Interessen anzeigen', bool(p.show_interests));
            kv('Audio anzeigen', bool(p.show_audio));
            kv('Aktualisiert am', fmt(p.updated_at));

            // 3. Sensitive Daten
            if (sensitiveRows.length > 0) {
                section('3. Sensitive Daten');
                const sd = sensitiveRows[0];
                kv('Behinderungstyp', decryptField(sd.disability_type) ?? '—');
                kv('Sichtbar', bool(sd.disability_visible));
                kv('Gespeichert am', fmt(sd.collected_at));
                kv('Aktualisiert am', fmt(sd.updated_at));
            }

            // 4. Einverständniserklärungen
            section('4. Einverständniserklärungen');
            if (consentRows.length === 0) {
                empty('Keine Einverständniserklärungen gespeichert.');
            } else {
                consentRows.forEach((cl: any, i: number) => {
                    if (i > 0) doc.moveDown(0.5);
                    kv('Typ', cl.type);
                    kv('Version', cl.version);
                    kv('Angenommen am', fmt(cl.accepted_at));
                    kv('Widerrufen am', cl.withdrawn_at ? fmt(cl.withdrawn_at) : '—');
                });
            }

            // 5. Interessen
            section('5. Interessen');
            if (interestRows.length === 0) {
                empty('Keine Interessen gespeichert.');
            } else {
                const byCategory: Record<string, string[]> = {};
                interestRows.forEach((ir: any) => {
                    if (!byCategory[ir.category]) byCategory[ir.category] = [];
                    byCategory[ir.category].push(ir.name_de);
                });
                Object.entries(byCategory).forEach(([cat, names]) => {
                    subheading(cat);
                    doc.fontSize(10).fillColor('#1f2937').text(names.join(', '), M + 10, doc.y, { width: pageW - 10 });
                    doc.moveDown(0.3);
                });
            }

            // 6. Medien
            if (mediaRows.length > 0) {
                section('6. Medienuploads');
                mediaRows.forEach((m: any, i: number) => {
                    if (i > 0) doc.moveDown(0.3);
                    kv('Typ', m.file_type);
                    kv('Status', m.moderation_status);
                    kv('Hochgeladen am', fmt(m.uploaded_at));
                    kv('Gelöscht am', m.deleted_at ? fmt(m.deleted_at) : '—');
                });
            }

            // 7. Abonnements
            if (subscriptionRows.length > 0) {
                section('7. Abonnements');
                subscriptionRows.forEach((s: any, i: number) => {
                    if (i > 0) doc.moveDown(0.5);
                    kv('Plan', s.plan);
                    kv('Status', s.status);
                    kv('Gestartet am', fmt(s.started_at));
                    kv('Endet am', fmt(s.expires_at));
                    kv('Gekündigt am', s.cancelled_at ? fmt(s.cancelled_at) : '—');
                });
            }

            // 8. Zahlungen
            if (paymentRows.length > 0) {
                section('8. Zahlungshistorie');
                paymentRows.forEach((pay: any, i: number) => {
                    if (i > 0) doc.moveDown(0.3);
                    kv('Betrag', `${pay.amount} ${pay.currency}`);
                    kv('Status', pay.status);
                    kv('Datum', fmt(pay.created_at));
                });
            }

            // 9. Nachrichten
            if (messageRows.length > 0) {
                section('9. Gesendete Nachrichten (max. 100)');
                doc.fontSize(9).fillColor('#6b7280').text(
                    'Es werden maximal 100 eigene Nachrichten exportiert.',
                    M, doc.y, { width: pageW },
                );
                doc.moveDown(0.2);
                messageRows.forEach((msg: any, i: number) => {
                    if (i > 0) doc.moveDown(0.3);
                    kv('Typ', msg.type);
                    kv('Gesendet am', fmt(msg.sent_at));
                    kv('Gelöscht', bool(msg.is_deleted));
                    kv('Inhalt', msg.is_deleted ? '[gelöscht]' : trunc(msg.content));
                });
            }

            // 10. Benachrichtigungseinstellungen
            section('10. Benachrichtigungseinstellungen');
            const ns = notifRows[0] ?? {};
            subheading('E-Mail');
            kv('Nachrichten', bool(ns.email_messages));
            kv('Matches', bool(ns.email_matches));
            kv('System', bool(ns.email_system));
            subheading('Push');
            kv('Nachrichten', bool(ns.push_messages));
            kv('Matches', bool(ns.push_matches));
            kv('System', bool(ns.push_system));

            // 11. Kontaktanfragen
            section('11. Kontaktanfragen');
            subheading('Gesendet');
            if (contactSentRows.length === 0) {
                empty('Keine gesendeten Anfragen.');
            } else {
                contactSentRows.forEach((cr: any, i: number) => {
                    if (i > 0) doc.moveDown(0.2);
                    kv('Status', cr.status);
                    kv('Gesendet am', fmt(cr.created_at));
                });
            }
            subheading('Erhalten');
            if (contactReceivedRows.length === 0) {
                empty('Keine erhaltenen Anfragen.');
            } else {
                contactReceivedRows.forEach((cr: any, i: number) => {
                    if (i > 0) doc.moveDown(0.2);
                    kv('Status', cr.status);
                    kv('Erhalten am', fmt(cr.created_at));
                });
            }

            // 12. Blockierungen
            if (blockRows.length > 0) {
                section('12. Blockierungen');
                doc.fontSize(9).fillColor('#6b7280').text(
                    'Aus Datenschutzgründen werden blockierte Nutzer nicht namentlich aufgeführt.',
                    M, doc.y, { width: pageW },
                );
                doc.moveDown(0.5);
                blockRows.forEach((b: any, i: number) => {
                    if (i > 0) doc.moveDown(0.2);
                    kv('Blockiert am', fmt(b.created_at));
                });
            }

            // 13. Meldungen
            if (reportRows.length > 0) {
                section('13. Eingereichte Meldungen');
                reportRows.forEach((r: any, i: number) => {
                    if (i > 0) doc.moveDown(0.5);
                    kv('Grund', trunc(r.reason));
                    kv('Beschreibung', trunc(r.description));
                    kv('Status', r.status);
                    kv('Eingereicht am', fmt(r.created_at));
                });
            }

            // 14. Strikes
            if (strikeRows.length > 0) {
                section('14. Verwarnungen');
                strikeRows.forEach((s: any, i: number) => {
                    if (i > 0) doc.moveDown(0.5);
                    kv('Typ', s.type);
                    kv('Grund', trunc(s.reason));
                    kv('Ausgesprochen am', fmt(s.created_at));
                    kv('Läuft ab', s.expires_at ? fmt(s.expires_at) : '—');
                });
            }

            doc.flushPages();
            const range = doc.bufferedPageRange();
            for (let i = 0; i < range.count; i++) {
                doc.switchToPage(i);
                const footerY = doc.page.height - doc.page.margins.bottom + 10;
                doc.fontSize(8).fillColor('#9ca3af')
                   .text(
                       `Paarship – Datenschutz-Export – Seite ${i + 1} von ${range.count}`,
                       M, footerY,
                       { width: pageW, align: 'center', lineBreak: false },
                   );
            }
            doc.end();
        });
    }
}
