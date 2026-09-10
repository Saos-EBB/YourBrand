import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { GdprService } from './gdpr.service';

@Controller('gdpr')
@UseGuards(JwtGuard)
export class GdprController {
    constructor(private readonly gdprService: GdprService) {}

    // Used to stream the finished PDF back synchronously — now queues the
    // export and emails it as an attachment once it's built (see
    // gdpr-export.processor.ts). API-breaking response shape change:
    // callers used to get a PDF blob, now get this confirmation instead.
    @Get('export')
    async exportData(@Request() req: any) {
        await this.gdprService.requestExport(req.user.sub);
        return { message: 'Dein Datenexport wird erstellt und per E-Mail zugeschickt.' };
    }
}
