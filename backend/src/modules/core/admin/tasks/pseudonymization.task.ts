import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { CronLockService } from '../../../../common/redis/cron-lock.service';

@Injectable()
export class PseudonymizationTask {
    private readonly logger = new Logger(PseudonymizationTask.name);

    constructor(
        private readonly dataSource: DataSource,
        private readonly cronLock: CronLockService,
    ) {}

    @Cron('0 2 * * *')
    async run() {
        await this.cronLock.runOnce('pseudonymization', 60 * 60_000, async () => {
            const rows: { id: string }[] = await this.dataSource.query(
                'SELECT id FROM users_pending_pseudonymization',
            );

            let count = 0;
            for (const { id } of rows) {
                try {
                    await this.dataSource.query('SELECT pseudonymize_user($1)', [id]);
                    count++;
                } catch (err) {
                    this.logger.error(`Pseudonymization failed for user ${id}`, err);
                }
            }

            this.logger.log(`Pseudonymized ${count} user(s)`);
        });
    }
}
