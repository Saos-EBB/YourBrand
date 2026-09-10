import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import sharp from 'sharp';
import { uploadObject } from '../../../common/storage/object-storage.helper';
import { MediaUpload, FileType, FileContext, ModerationStatus } from './entities/media-upload.entity';
import { Profile } from '../profile/entities/profile.entity';
import { User } from '../auth/entities/user.entity';
import { ProfanityService } from '../moderation/profanity.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class MediaService {
    constructor(
        @InjectRepository(MediaUpload)
        private readonly mediaRepository: Repository<MediaUpload>,
        @InjectRepository(Profile)
        private readonly profileRepository: Repository<Profile>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly profanityService: ProfanityService,
        private readonly systemSettingsService: SystemSettingsService,
        private readonly eventEmitter: EventEmitter2,
    ) {}

    private buildWatermarkSvg(text: string, imgWidth: number, imgHeight: number): Buffer {
        const fontSize = 14;
        const margin   = 12;
        // text-anchor="end" means x is the right edge of the text — gives a clean right margin
        const x = imgWidth - margin;
        const y = margin + fontSize;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgWidth}" height="${imgHeight}">
  <defs>
    <filter id="ds">
      <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>
  <text x="${x}" y="${y}"
    font-family="'Courier New',monospace"
    font-size="${fontSize}"
    font-weight="bold"
    fill="white"
    fill-opacity="0.75"
    text-anchor="end"
    filter="url(#ds)"
  >${text}</text>
</svg>`;
        return Buffer.from(svg);
    }

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

    async uploadProfilePhoto(
        userId: string,
        file: Express.Multer.File,
    ): Promise<{ file_url: string; id: string }> {
        try {
            if (file.size > MAX_SIZE_BYTES) {
                throw new BadRequestException('Datei zu groß. Maximal 5 MB erlaubt.');
            }

            if (!this.validateMagicBytes(file.buffer)) {
                throw new BadRequestException('Ungültiges Dateiformat');
            }

            const filename = `${userId}-${Date.now()}.webp`;

            // Resize + convert to WebP buffer so we can inspect dimensions and composite the watermark.
            const resizedBuf = await sharp(file.buffer)
                .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toBuffer();

            const user = await this.userRepository.findOne({ where: { id: userId } });
            const publicId = user?.public_id;

            let finalBuf: Buffer;
            if (publicId) {
                const prefix = await this.systemSettingsService.getString('watermark_prefix', 'ID');
                const watermarkText = `#${prefix}-${publicId}`;
                const { width = 800, height = 800 } = await sharp(resizedBuf).metadata();
                const watermarkSvg = this.buildWatermarkSvg(watermarkText, width, height);
                finalBuf = await sharp(resizedBuf)
                    .composite([{ input: watermarkSvg, top: 0, left: 0 }])
                    .toBuffer();
            } else {
                finalBuf = resizedBuf;
            }

            const fileSizeKb = Math.ceil(finalBuf.length / 1024);
            const fileUrl = await uploadObject(`profiles/${filename}`, finalBuf, 'image/webp');

            const media = this.mediaRepository.create({
                uploaded_by: userId,
                file_url: fileUrl,
                file_type: FileType.IMAGE,
                context: FileContext.PROFILE,
                moderation_status: ModerationStatus.PENDING,
                is_encrypted: false,
                file_size_kb: fileSizeKb,
                conversation_id: null,
                org_id: null,
                file_use_for: 'profile_photo',
            });
            const saved = await this.mediaRepository.save(media);

            await this.profileRepository.update({ user_id: userId }, { photo_id: saved.id });

            this.profanityService.createImageTicket(userId, saved.id).catch(() => {});

            this.eventEmitter.emit('media.pending_review', {
                mediaId: saved.id,
                fileType: FileType.IMAGE,
                uploadedAt: saved.uploaded_at,
                uploadedBy: userId,
            });

            return { file_url: fileUrl, id: saved.id };
        } catch (err) {
            throw err;
        }
    }
}
