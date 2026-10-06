import { Controller, Post, Get, Delete, Patch, Body, Query, HttpCode, HttpStatus, UseGuards, Request, Req, Res, UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ConsentDto } from './dto/consent.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';

// Lokal liegen Frontend und Backend auf derselben Site (localhost:3001 /
// localhost:3000) — SameSite=Lax reicht, das Refresh-Cookie geht mit.
// Im Split-Deploy (Frontend und Backend auf verschiedenen Domains) ist
// jeder Request cross-site: der Browser haengt ein Lax-Cookie dann nicht an,
// POST /auth/refresh kommt ohne Token an und jede Session ist nach Ablauf des
// Access-Tokens tot. Fuer diesen Fall COOKIE_SAMESITE=none setzen.
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE ?? 'lax') as 'lax' | 'strict' | 'none';

const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    // SameSite=None akzeptieren Browser ausschliesslich zusammen mit Secure —
    // ohne das wird das Cookie kommentarlos verworfen.
    secure: COOKIE_SAMESITE === 'none' || process.env.NODE_ENV === 'production',
    sameSite: COOKIE_SAMESITE,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
};

// clearCookie loescht nur, wenn der Browser das Loesch-Cookie ueberhaupt
// annimmt — cross-site heisst das SameSite=None + Secure, sonst verwirft
// Chrome das Set-Cookie und der Refresh-Token bleibt im Browser stehen.
// Deshalb dieselben Attribute wie beim Setzen, nur ohne maxAge.
const { maxAge: _maxAge, ...CLEAR_COOKIE_OPTIONS } = REFRESH_COOKIE_OPTIONS;

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    async register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { ttl: 60000, limit: 5 } })
    // Nur im Loadtest-Stack (LOADTEST_MODE=true) aufgehoben — Brute-Force-Schutz
    // bleibt fuer Demo/Prod unveraendert. Loadtest-User teilen sich alle dieselbe
    // Quell-IP (der Testrunner), gegen die der Login-Throttle sonst sofort greift.
    @SkipThrottle({ default: process.env.LOADTEST_MODE === 'true' })
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
        const { accessToken, rawRefreshToken, needsConsent } = await this.authService.login(dto);
        res.cookie('refreshToken', rawRefreshToken, REFRESH_COOKIE_OPTIONS);
        return { accessToken, needsConsent };
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
        const token: string | undefined = req.cookies?.refreshToken;
        if (!token) throw new UnauthorizedException('Kein Refresh-Token vorhanden');
        try {
            const { accessToken, rawRefreshToken } = await this.authService.refresh(token);
            res.cookie('refreshToken', rawRefreshToken, REFRESH_COOKIE_OPTIONS);
            return { accessToken };
        } catch (err) {
            res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
            throw err;
        }
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
        const token: string | undefined = req.cookies?.refreshToken;
        if (token) await this.authService.logout(token);
        res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
        return { message: 'Erfolgreich ausgeloggt' };
    }

    @Get('me')
    @UseGuards(JwtGuard)
    async me(@Request() req: any) {
        return { user: req.user };
    }

    @Get('verify')
    async verifyEmail(@Query('token') token: string) {
        if (!token) throw new BadRequestException('Token fehlt');
        return this.authService.verifyEmail(token);
    }

    @Post('forgot-password')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { ttl: 60000, limit: 3 } })
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.authService.forgotPassword(dto.email);
    }

    @Post('reset-password')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { ttl: 60000, limit: 3 } })
    async resetPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto.token, dto.password);
    }

    @Get('agb-versions')
    async getAgbVersions() {
        return this.authService.getAgbVersions();
    }

    @Post('consent')
    @UseGuards(JwtGuard)
    @HttpCode(HttpStatus.OK)
    async createConsents(@Req() req: any, @Body() dto: ConsentDto) {
        const ip: string = req.ip ?? '0.0.0.0';
        return this.authService.createConsents(req.user.sub, dto.consents, ip);
    }

    @Patch('change-password')
    @UseGuards(JwtGuard)
    @HttpCode(HttpStatus.OK)
    async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
        return this.authService.changePassword(req.user.sub, dto.current_password, dto.new_password);
    }

    @Patch('change-email')
    @UseGuards(JwtGuard)
    @HttpCode(HttpStatus.OK)
    async changeEmail(@Request() req: any, @Body() dto: ChangeEmailDto) {
        return this.authService.changeEmail(req.user.sub, dto.current_password, dto.new_email);
    }

    @Delete('account')
    @UseGuards(JwtGuard)
    @HttpCode(HttpStatus.OK)
    async deleteAccount(@Req() req: any, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.deleteAccount(req.user.sub);
        res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
        return result;
    }

}
