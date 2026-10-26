import { RouteClass } from '../../../common/route-class/route-class.decorator';
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
import { SkipThrottle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { OptionalJwtGuard } from '../../../common/guards/optional-jwt.guard';
import { MediaService, MAX_SIZE_BYTES } from './media.service';
import { streamObject, guessContentType, publicUrlForKey } from '../../../common/storage/object-storage.helper';

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

    @RouteClass('upload')
    @Post('upload/profile-photo')
    @UseGuards(JwtGuard)
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            // Grenze schon beim Einlesen: sonst liegt eine beliebig grosse Datei komplett im RAM,
            // bevor der Service sie ablehnt (413 statt voller Heap).
            limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
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

    // Freigegebene Medien oeffentlich (img-Tags schicken keinen Token), pending/abgelehnte nur fuer Besitzer und
    // Admins mit Login, sonst 404 wie eine fehlende Datei (Loadtest-Audit B6). S3_PUBLIC_URL_BASE zeigt hierher statt direkt auf
    // MinIO, das nie oeffentlich erreichbar ist (nur im Docker-Netz, nur HTTP).
    // Das Backend ist damit die einzige Origin fuer Medien. Wildcard-Key per
    // req.path statt @Param — path-to-regexp-Wildcard-Syntax variiert je
    // Express-Version, string-slice ist stabil.
    // SkipThrottle wie /health und die Root-Status-Route: eine Seite mit
    // mehreren Profilfotos verbraucht sonst pro geladenem Bild ein Kontingent
    // vom globalen 100-Requests/60s-Limit pro IP.
    @SkipThrottle()
    @UseGuards(OptionalJwtGuard)
    @Get('file/*')
    async serveFile(@Req() req: ExpressRequest, @Res() res: Response) {
        const marker = '/media/file/';
        const idx = req.path.indexOf(marker);
        const key = decodeURIComponent(req.path.slice(idx + marker.length));
        if (!key) throw new NotFoundException('Datei nicht gefunden');

        const access = await this.mediaService.fileAccess(publicUrlForKey(key));
        const user = (req as ExpressRequest & { user?: { sub: string; role?: string } }).user;
        const allowed = access && (access.public
            || (user && (user.sub === access.uploaded_by || user.role === 'admin' || user.role === 'owner')));
        if (!allowed) throw new NotFoundException('Datei nicht gefunden');

        // Gestreamt statt ganz in den Speicher geladen; Browser duerfen eine Stunde cachen.
        let object: Awaited<ReturnType<typeof streamObject>>;
        try {
            object = await streamObject(key);
        } catch (err) {
            if ((err as { name?: string }).name === 'NoSuchKey') throw new NotFoundException('Datei nicht gefunden');
            throw err;
        }
        res.set('Content-Type', guessContentType(key));
        res.set('Cache-Control', access.public ? 'public, max-age=3600' : 'private, no-store');
        if (object.etag) res.set('ETag', object.etag);
        if (object.length !== undefined) res.set('Content-Length', String(object.length));
        object.body.on('error', () => res.destroy());
        object.body.pipe(res);
    }
}
