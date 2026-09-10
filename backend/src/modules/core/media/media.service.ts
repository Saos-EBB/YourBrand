import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { uploadObject } from '../../../common/storage/object-storage.helper';
import { MEDIA_PROCESSING_QUEUE, MEDIA_TICKET_QUEUE } from '../../../common/queue/queue.constants';
import { MediaUpload, FileType, FileContext, ModerationStatus } from './entities/media-upload.entity';
import { Profile } from '../profile/entities/profile.entity';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class MediaService {
    constructor(
        @InjectRepository(MediaUpload)
        private readonly mediaRepository: Repository<MediaUpload>,
        @InjectRepository(Profile)
        private readonly profileRepository: Repository<Profile>,
        private readonly eventEmitter: EventEmitter2,
        @InjectQueue(MEDIA_PROCESSING_QUEUE)
        private readonly mediaQueue: Queue,
        @InjectQueue(MEDIA_TICKET_QUEUE)
        private readonly mediaTicketQueue: Queue,
    ) {}

    private validateMagicBytes(buffer: Buffer): boolean {
        if (buffer.length < 12) return false;

        // JPEG: FF D8 FF
        if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;

        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (
            buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
            buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A
        ) return true;

        // WebP: RIFF at bytes 0–3, WEBP at bytes 8–11
        if (
            buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
            buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
        ) return true;

        return false;
    }

    // Uploads the raw file immediately under its final key so the response
    // stays fast — resize/watermark happens in MediaProcessor (worker
    // process), which overwrites this same object a few seconds later. No
    // schema change: file_url is populated from the start, it just briefly
    // points at the unprocessed image.
    async uploadProfilePhoto(
        userId: string,
        file: Express.Multer.File,
    ): Promise<{ file_url: string; id: string }> {
        if (file.size > MAX_SIZE_BYTES) {
            throw new BadRequestException('Datei zu groß. Maximal 5 MB erlaubt.');
        }

        if (!this.validateMagicBytes(file.buffer)) {
            throw new BadRequestException('Ungültiges Dateiformat');
        }

        const filename = `${userId}-${Date.now()}.webp`;
        const storageKey = `profiles/${filename}`;
        const fileUrl = await uploadObject(storageKey, file.buffer, file.mimetype);

        const media = this.mediaRepository.create({
            uploaded_by: userId,
            file_url: fileUrl,
            file_type: FileType.IMAGE,
            context: FileContext.PROFILE,
            moderation_status: ModerationStatus.PENDING,
            is_encrypted: false,
            file_size_kb: Math.ceil(file.size / 1024),
            conversation_id: null,
            org_id: null,
            file_use_for: 'profile_photo',
        });
        const saved = await this.mediaRepository.save(media);

        await this.profileRepository.update({ user_id: userId }, { photo_id: saved.id });

        await this.mediaTicketQueue.add('create-image-ticket', {
            userId,
            mediaId: saved.id,
        });

        this.eventEmitter.emit('media.pending_review', {
            mediaId: saved.id,
            fileType: FileType.IMAGE,
            uploadedAt: saved.uploaded_at,
            uploadedBy: userId,
        });

        await this.mediaQueue.add('resize-and-watermark', {
            mediaId: saved.id,
            storageKey,
            userId,
        });

        return { file_url: fileUrl, id: saved.id };
    }
}
