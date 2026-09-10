import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GDPR_EXPORT_QUEUE } from '../../../common/queue/queue.constants';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class GdprService {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectQueue(GDPR_EXPORT_QUEUE)
        private readonly gdprExportQueue: Queue,
    ) {}

    // The 15-query fetch + pdfkit build (~300 lines) moved to
    // gdpr-export.processor.ts (worker only) — it used to run inline on the
    // request and block the event loop. The rate-limit check stays here
    // since it's cheap and should reject fast; last_gdpr_export_at itself is
    // only updated by the processor once the export actually succeeds, so a
    // failed job doesn't burn the user's 30-day window.
    async requestExport(userId: string): Promise<void> {
        const [rateRow] = await this.dataSource.query<{ last_gdpr_export_at: Date | null }[]>(
            'SELECT last_gdpr_export_at FROM users WHERE id = $1',
            [userId],
        );
        if (rateRow?.last_gdpr_export_at) {
            const elapsed = Date.now() - new Date(rateRow.last_gdpr_export_at).getTime();
            if (elapsed < THIRTY_DAYS_MS) {
                const nextDate = new Date(new Date(rateRow.last_gdpr_export_at).getTime() + THIRTY_DAYS_MS);
                throw new ForbiddenException(
                    `Datenexport erst wieder möglich ab ${nextDate.toLocaleDateString('de-DE')}.`,
                );
            }
        }

        await this.gdprExportQueue.add('generate-export', { userId });
    }
}
