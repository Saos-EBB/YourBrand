import {
    Controller,
    Get,
    Post,
    Req,
    Res,
    Request,
    UploadedFile,
    UseGuards,
    UseInterceptors,
    UseFilters,
    BadRequestException,
    NotFoundException,
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { MediaService } from './media.service';
import { downloadObject, guessContentType } from '../../../common/storage/object-storage.helper';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Catch()
class MediaDebugFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const res = host.switchToHttp().getResponse<any>();
        const status = exception instanceof HttpException ? exception.getStatus() : 500;
        res.status(status).json(
            exception instanceof HttpException
                ? exception.getResponse()
                : { statusCode: 500, message: 'Internal server error' },
        );
    }
}

@Controller('media')
@UseFilters(new MediaDebugFilter())
export class MediaController {
    constructor(private readonly mediaService: MediaService) {}

    @Post('upload/profile-photo')
    @UseGuards(JwtGuard)
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            fileFilter: (_req, file, cb) => {
                if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new BadRequestException('Nur JPEG, PNG und WebP erlaubt'), false);
                }
            },
        }),
    )
    async uploadProfilePhoto(
        @Request() req: any,
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (!file) throw new BadRequestException('Keine Datei hochgeladen');
        return this.mediaService.uploadProfilePhoto(req.user.sub, file);
    }

    // Oeffentlich (kein Guard) — S3_PUBLIC_URL_BASE zeigt hierher statt direkt auf
    // MinIO, das im ngrok-Deploy nicht getunnelt und nur ueber HTTP erreichbar
    // ist (Mixed-Content-Block auf der HTTPS-Vercel-Seite). Wildcard-Key per
    // req.path statt @Param — path-to-regexp-Wildcard-Syntax variiert je
    // Express-Version, string-slice ist stabil.
    @Get('file/*')
    async serveFile(@Req() req: ExpressRequest, @Res() res: Response) {
        const marker = '/media/file/';
        const idx = req.path.indexOf(marker);
        const key = decodeURIComponent(req.path.slice(idx + marker.length));
        if (!key) throw new NotFoundException('Datei nicht gefunden');

        const buffer = await downloadObject(key);
        res.set('Content-Type', guessContentType(key));
        res.send(buffer);
    }
}
