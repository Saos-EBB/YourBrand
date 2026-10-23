import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

// Postgres-Fehler, die keine Serverfehler sind: Konflikte aus parallelen Requests (UNIQUE/FK) und
// Abfragen, die das statement_timeout abgebrochen hat. Ohne diese Zuordnung wurde jeder davon eine 500.
const PG_STATUS: Record<string, { status: HttpStatus; message: string }> = {
    '23505': { status: HttpStatus.CONFLICT, message: 'Konflikt: Eintrag existiert bereits' },
    '23503': { status: HttpStatus.CONFLICT, message: 'Konflikt: verknuepfter Eintrag fehlt oder wird noch verwendet' },
    '57014': { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'Zeitlimit ueberschritten, bitte erneut versuchen' },
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const request = ctx.getRequest<Request>();
        const response = ctx.getResponse<Response>();

        const pg = exception instanceof QueryFailedError
            ? PG_STATUS[(exception.driverError as { code?: string })?.code ?? '']
            : undefined;

        const status = exception instanceof HttpException
            ? exception.getStatus()
            : pg?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;

        const exceptionResponse = exception instanceof HttpException
            ? exception.getResponse()
            : pg?.message ?? null;

        const message = typeof exceptionResponse === 'object' && exceptionResponse !== null
            ? (exceptionResponse as any).message ?? 'Internal server error'
            : exceptionResponse ?? 'Internal server error';

        const error = typeof exceptionResponse === 'object' && exceptionResponse !== null
            ? (exceptionResponse as any).error ?? HttpStatus[status]
            : HttpStatus[status];

        const line = `${new Date().toISOString()} | ${request.method} ${request.url.split('?')[0]} | ${status} | userId:${(request['user'] as any)?.sub ?? 'unauthenticated'} | ${Array.isArray(message) ? message.join(', ') : message}`;
        // Bei echten Serverfehlern den Stack mitloggen, sonst ist die Ursache nur aus Nebenlogs zu raten.
        if (status === HttpStatus.INTERNAL_SERVER_ERROR && exception instanceof Error) {
            this.logger.error(line, exception.stack);
        } else {
            this.logger.error(line);
        }

        if (status === HttpStatus.SERVICE_UNAVAILABLE && pg) response.set('Retry-After', '2');
        response.status(status).json({
            statusCode: status,
            error,
            message,
        });
    }
}
