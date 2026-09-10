import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
    private resend = new Resend(process.env.RESEND_API_KEY);

    async sendVerificationEmail(to: string, token: string) {
        const link = `${process.env.APP_URL}/auth/verify?token=${token}`;

        await this.resend.emails.send({
            from: 'onboarding@resend.dev',
            // TODO: if managed account, use contact_email_encrypted from managed_accounts instead
            to,
            subject: 'Email bestätigen – Paarship',
            html: `
        <h2>Willkommen bei Paarship!</h2>
        <p>Bitte bestätige deine Email-Adresse:</p>
        <a href="${link}">Email bestätigen</a>
        <p>Der Link ist 24 Stunden gültig.</p>
      `,
        });
    }

    async sendPasswordResetEmail(to: string, token: string) {
        const link = `${process.env.APP_URL}/auth/reset-password?token=${token}`;

        await this.resend.emails.send({
            from: 'onboarding@resend.dev',
            // TODO: if managed account, use contact_email_encrypted from managed_accounts instead
            to,
            subject: 'Passwort zurücksetzen – Paarship',
            html: `
        <h2>Passwort zurücksetzen</h2>
        <p>Klick auf den Link um dein Passwort zurückzusetzen:</p>
        <a href="${link}">Passwort zurücksetzen</a>
        <p>Der Link ist 1 Stunde gültig.</p>
      `,
        });
    }

    async sendBanEmail(to: string, reason: string, expiresAt: Date | null) {
        const durationText = expiresAt
            ? `bis ${expiresAt.toLocaleDateString('de-DE')}`
            : 'dauerhaft';

        await this.resend.emails.send({
            from: 'onboarding@resend.dev',
            to,
            subject: 'Dein Account wurde gesperrt',
            html: `
        <h2>Dein Account wurde gesperrt</h2>
        <p><strong>Grund:</strong> ${reason}</p>
        <p><strong>Dauer:</strong> ${durationText}</p>
      `,
        });
    }

    // PDF as an attachment, not a link: the export contains real PII
    // (decrypted email, Art.-9 sensitive data) and the object storage bucket
    // profile photos use is public-read — a link there would be a data leak.
    async sendGdprExportEmail(to: string, pdfBuffer: Buffer) {
        await this.resend.emails.send({
            from: 'onboarding@resend.dev',
            to,
            subject: 'Dein Datenexport ist fertig – Paarship',
            html: `
        <h2>Dein Datenexport ist fertig</h2>
        <p>Im Anhang findest du alle personenbezogenen Daten, die wir zu deinem Konto gespeichert haben (Art. 15 DSGVO).</p>
      `,
            attachments: [{
                filename: 'paarship-daten-export.pdf',
                content: pdfBuffer,
                contentType: 'application/pdf',
            }],
        });
    }

    async sendAutoSuspendEmail(to: string) {
        await this.resend.emails.send({
            from: 'onboarding@resend.dev',
            to,
            subject: 'Dein Account wurde vorübergehend gesperrt',
            html: `
        <h2>Dein Account wurde vorübergehend gesperrt</h2>
        <p>Dein Profil wurde aufgrund mehrerer Meldungen automatisch gesperrt. Ein Admin wird den Fall prüfen.</p>
      `,
        });
    }
}