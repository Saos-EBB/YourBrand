import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MEDIA_TICKET_QUEUE } from '../../../common/queue/queue.constants';

interface CreateImageTicketJob {
    userId: string;
    mediaId: string;
}

// Was ProfanityService.createImageTicket(), called as
// `.catch(() => {})` with no logging at all — a failure vanished
// completely, worse than checkAutoSuspend's at-least-logged version.
// Registered as a provider ONLY in WorkerModule, never in MediaModule.
@Processor(MEDIA_TICKET_QUEUE)
export class MediaTicketProcessor extends WorkerHost {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly eventEmitter: EventEmitter2,
    ) {
        super();
    }

    async process(job: Job<CreateImageTicketJob>): Promise<void> {
        const { userId, mediaId } = job.data;

        await this.dataSource.query(
            `INSERT INTO admin_tickets (type, user_id, context) VALUES ('image', $1, $2)`,
            [userId, JSON.stringify({ media_id: mediaId, user_id: userId })],
        );
        this.eventEmitter.emit('ticket.new', {});
    }
}
