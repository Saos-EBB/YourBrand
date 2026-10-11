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
        const link = `${process.env.APP_URL}/reset-password?token=${token}`;

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

    // Shop-Alarm an Admins: nur Bestell-/Fallnummer und Link, keine Kaeuferdaten
    async sendShopAlertEmail(to: string, subject: string, text: string, link: string) {
        // Resend wirft nicht, sondern liefert { error }
        const { error } = await this.resend.emails.send({
            from: 'onboarding@resend.dev',
            to,
            subject,
            html: `
        <h2>${subject}</h2>
        <p>${text}</p>
        <a href="${link}">Zur Shop-Konsole</a>
      `,
        });
        if (error) throw new Error(error.message);
    }

    // Rechnung als Anhang (nicht als Link: der Bucket ist public-read)
    async sendShopInvoiceEmail(to: string, subject: string, text: string, filename: string, pdf: Buffer) {
        const { error } = await this.resend.emails.send({
            from: 'onboarding@resend.dev',
            to,
            subject,
            html: `<p>${text}</p>`,
            attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
        });
        if (error) throw new Error(error.message);
    }

    // § 312i BGB: Eingang bestaetigen — ausdruecklich noch keine Annahme
    async sendShopOrderReceivedEmail(to: string, orderNo: string, total: string, link: string) {
        const { error } = await this.resend.emails.send({
            from: 'onboarding@resend.dev',
            to,
            subject: `Bestellung #${orderNo} eingegangen`,
            html: `
        <h2>Danke, deine Bestellung ist eingegangen</h2>
        <p>Bestellung #${orderNo} über ${total}. Der Betrag ist auf deiner Karte nur reserviert.</p>
        <p>Das ist eine Eingangsbestätigung, noch keine Annahme. Sobald wir deine Bestellung annehmen, wird abgebucht und du bekommst die Rechnung.</p>
        <a href="${link}">Bestellung ansehen</a>
      `,
        });
        if (error) throw new Error(error.message);
    }

    async sendShopOrderDeclinedEmail(to: string, orderNo: string, reason: 'rejected' | 'expired', link: string) {
        const text = reason === 'rejected'
            ? 'Wir können deine Bestellung leider nicht annehmen.'
            : 'Wir konnten deine Bestellung leider nicht rechtzeitig bestätigen.';
        const { error } = await this.resend.emails.send({
            from: 'onboarding@resend.dev',
            to,
            subject: `Bestellung #${orderNo} nicht angenommen`,
            html: `
        <h2>${text}</h2>
        <p>Die Reservierung auf deiner Karte ist aufgehoben, es wurde nichts abgebucht.</p>
        <a href="${link}">Bestellung ansehen</a>
      `,
        });
        if (error) throw new Error(error.message);
    }
}
