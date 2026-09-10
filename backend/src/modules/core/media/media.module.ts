import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { MediaUpload } from './entities/media-upload.entity';
import { Profile } from '../profile/entities/profile.entity';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import {
    MEDIA_PROCESSING_QUEUE,
    MEDIA_TICKET_QUEUE,
    DEFAULT_JOB_OPTIONS,
} from '../../../common/queue/queue.constants';

@Module({
    imports: [
        TypeOrmModule.forFeature([MediaUpload, Profile]),
        // JwtGuard (used in media.controller.ts) resolves JwtService via the
        // global SharedJwtModule — no local JwtModule.registerAsync needed
        // (this module never had JwtGuard in its own providers either; found
        // this dead duplicate while adding the queue below).
        // ModerationModule (ProfanityService) no longer needed — its only use
        // here, createImageTicket, moved to media-ticket.processor.ts.
        BullModule.registerQueue(
            { name: MEDIA_PROCESSING_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS },
            { name: MEDIA_TICKET_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS },
        ),
    ],
    controllers: [MediaController],
    providers: [MediaService],
    exports: [MediaService],
})
export class MediaModule {}
