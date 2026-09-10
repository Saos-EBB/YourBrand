import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sharp from 'sharp';
import { downloadObject, uploadObject } from '../../../common/storage/object-storage.helper';
import { MEDIA_PROCESSING_QUEUE } from '../../../common/queue/queue.constants';
import { MediaUpload } from './entities/media-upload.entity';
import { User } from '../auth/entities/user.entity';
import { SystemSettingsService } from '../system-settings/system-settings.service';

interface ResizeAndWatermarkJob {
    mediaId: string;
    storageKey: string;
    userId: string;
}

// Registered as a provider ONLY in WorkerModule — never in MediaModule,
// which AppModule (and therefore the API process) also loads. See
// worker.module.ts's comment for why that separation matters.
@Processor(MEDIA_PROCESSING_QUEUE)
export class MediaProcessor extends WorkerHost {
    constructor(
        @InjectRepository(MediaUpload)
        private readonly mediaRepository: Repository<MediaUpload>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly systemSettingsService: SystemSettingsService,
    ) {
        super();
    }

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

    async process(job: Job<ResizeAndWatermarkJob>): Promise<void> {
        const { mediaId, storageKey, userId } = job.data;

        const rawBuf = await downloadObject(storageKey);

        const resizedBuf = await sharp(rawBuf)
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

        // Same key as the raw upload — overwrites it, file_url stays stable.
        await uploadObject(storageKey, finalBuf, 'image/webp');

        await this.mediaRepository.update(mediaId, {
            file_size_kb: Math.ceil(finalBuf.length / 1024),
        });
    }
}
