import { Injectable, ConflictException, UnauthorizedException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThan, ILike } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { hashPassword, comparePassword } from '../../../common/bcrypt/bcrypt-pool.helper';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConsentItemDto } from './dto/consent.dto';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Profile } from '../profile/entities/profile.entity';
import { AgbVersion } from '../profile/entities/agb-version.entity';
import { ConsentLog } from '../profile/entities/consent-log.entity';
import { MailService } from '../../../common/mail/mail.service';
import { encryptField, decryptField } from '../../../common/crypto/crypto.helper';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(RefreshToken)
        private readonly refreshTokenRepository: Repository<RefreshToken>,
        @InjectRepository(Profile)
        private readonly profileRepository: Repository<Profile>,
        @InjectRepository(AgbVersion)
        private readonly agbVersionRepository: Repository<AgbVersion>,
        @InjectRepository(ConsentLog)
        private readonly consentLogRepository: Repository<ConsentLog>,
        private readonly jwtService: JwtService,
        private readonly mailService: MailService,
    ) { }

    private generateNickname(email: string): string {
        const local = email.split('@')[0];
        const stripped = local.replace(/[^a-zA-Z0-9]/g, '');
        const truncated = stripped.slice(0, 20);
        const digits = Math.floor(1000 + Math.random() * 9000).toString();
        return (truncated + digits).toLowerCase();
    }

    private hashEmail(email: string): string {
        if (!process.env.EMAIL_SALT) throw new Error('EMAIL_SALT env var is not set');
        const salt = process.env.EMAIL_SALT;
        return crypto
            .createHash('sha256')
            .update(email.toLowerCase().trim() + salt)
            .digest('hex');
    }

    private hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    private generateRefreshToken(): string {
        return crypto.randomBytes(64).toString('hex');
    }

    private async generatePublicId(): Promise<string> {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        for (let attempt = 0; attempt < 100; attempt++) {
            const id = Array.from({ length: 4 }, () => charset[Math.floor(Math.random() * 36)]).join('');
            const existing = await this.userRepository.findOne({ where: { public_id: id } });
            if (!existing) return id;
        }
        throw new Error('Could not generate unique public_id');
    }

    async register(dto: RegisterDto) {
        const emailHash = this.hashEmail(dto.email);

        const exists = await this.userRepository.findOne({
            where: { email_search_hash: emailHash },
        });
        if (exists) throw new ConflictException('Email bereits registriert');

        const passwordHash = await hashPassword(dto.password, 12);

        const user = this.userRepository.create({
            email_search_hash: emailHash,
            password_hash: passwordHash,
            email: encryptField(dto.email),
            public_id: await this.generatePublicId(),
        });

        await this.userRepository.save(user);

        if (['development', 'dev', 'local'].includes(process.env.NODE_ENV ?? '')) {
            user.is_verified = true;
            user.email_verified_at = new Date();
            await this.userRepository.save(user);
        }

        const profile = this.profileRepository.create({
            user_id: user.id,
            nickname: this.generateNickname(dto.email),
            birthdate: '1990-01-01',
            is_published: false,
            onboarding_completed: false,
            updated_at: new Date(),
        });
        await this.profileRepository.save(profile);

        await this.sendVerificationEmail(user.id);
        return { message: 'Registrierung erfolgreich' };
    }

    async login(dto: LoginDto) {
        let user: User | null;

        if (dto.identifier.includes('@')) {
            const emailHash = this.hashEmail(dto.identifier);
            user = await this.userRepository.findOne({
                where: { email_search_hash: emailHash },
            });
        } else {
            const profile = await this.profileRepository.findOne({
                where: { nickname: ILike(dto.identifier) },
            });
            user = profile
                ? await this.userRepository.findOne({ where: { id: profile.user_id } })
                : null;
        }

        if (!user) throw new UnauthorizedException('Ungültige Zugangsdaten');

        if (user.deleted_at) {
            const daysSinceDeletion = (Date.now() - user.deleted_at.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceDeletion > 30) {
                throw new UnauthorizedException('Ungültige Zugangsdaten');
            }
        }

        const passwordValid = await comparePassword(dto.password, user.password_hash ?? '');
        if (!passwordValid) throw new UnauthorizedException('Ungültige Zugangsdaten');

        if (user.deleted_at) {
            user.deleted_at = null;
        }

        if (user.is_banned) {
            if (user.ban_expires_at && user.ban_expires_at < new Date()) {
                user.is_banned = false;
                user.ban_reason = null;
                user.ban_expires_at = null;
                await this.userRepository.save(user);
            } else {
                const suffix = user.ban_expires_at ? ` bis ${user.ban_expires_at.toISOString()}` : '';
                throw new ForbiddenException(`Ihr Account ist gesperrt${suffix}`);
            }
        }

        const payload = { sub: user.id, role: user.role };
        const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });

        const rawRefreshToken = this.generateRefreshToken();
        const tokenHash = this.hashToken(rawRefreshToken);

        const refreshToken = this.refreshTokenRepository.create({
            user_id: user.id,
            token_hash: tokenHash,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });

        user.last_login = new Date();
        await this.userRepository.save(user);

        await this.profileRepository.update({ user_id: user.id }, { last_active_at: new Date() });

        await this.refreshTokenRepository.save(refreshToken);

        const currentVersions = await this.agbVersionRepository.find({ where: { is_current: true } });
        const acceptedLogs = await this.consentLogRepository.find({
            where: { user_id: user.id, accepted: true },
        });
        const acceptedVersionIds = new Set(acceptedLogs.map((l) => l.agb_version_id));
        const needsConsent = currentVersions.some((v) => !acceptedVersionIds.has(v.id));

        return { accessToken, rawRefreshToken, needsConsent };
    }

    async refresh(rawToken: string) {
        const tokenHash = this.hashToken(rawToken);

        const stored = await this.refreshTokenRepository.findOne({
            where: { token_hash: tokenHash, is_revoked: false },
        });

        if (!stored) throw new UnauthorizedException('Ungültiger Token');
        if (stored.expires_at < new Date()) throw new UnauthorizedException('Token abgelaufen');

        const user = await this.userRepository.findOne({ where: { id: stored.user_id, deleted_at: IsNull() } });
        if (!user) throw new UnauthorizedException('User nicht gefunden');

        await this.refreshTokenRepository.update({ token_hash: stored.token_hash }, { is_revoked: true });

        const newRawToken = this.generateRefreshToken();
        const newTokenHash = this.hashToken(newRawToken);
        const newRefreshToken = this.refreshTokenRepository.create({
            user_id: user.id,
            token_hash: newTokenHash,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
        await this.refreshTokenRepository.save(newRefreshToken);

        const payload = { sub: user.id, role: user.role };
        const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });

        return { accessToken, rawRefreshToken: newRawToken };
    }

    async logout(rawToken: string) {
        const tokenHash = this.hashToken(rawToken);

        await this.refreshTokenRepository.update(
            { token_hash: tokenHash },
            { is_revoked: true },
        );

        return { message: 'Erfolgreich ausgeloggt' };
    }

    async sendVerificationEmail(userId: string) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user?.email) throw new NotFoundException('User nicht gefunden');
        const email = decryptField(user.email as Buffer)!;

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(token);

        await this.userRepository.update(userId, {
            email_verification_token: tokenHash,
            email_verification_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        await this.mailService.sendVerificationEmail(email, token);
        return { message: 'Verifizierungs-Email gesendet' };
    }

    async verifyEmail(token: string) {
        const tokenHash = this.hashToken(token);

        const user = await this.userRepository.findOne({
            where: {
                email_verification_token: tokenHash,
                email_verification_expires_at: MoreThan(new Date()),
                email_verified_at: IsNull(),
            },
        });

        if (!user) throw new NotFoundException('Token ungültig oder abgelaufen');

        user.email_verified_at = new Date();
        user.email_verification_token = null;
        user.email_verification_expires_at = null;
        user.is_verified = true;
        await this.userRepository.save(user);

        return { message: 'Email erfolgreich bestätigt' };
    }

    async forgotPassword(email: string) {
        const emailHash = this.hashEmail(email);
        const user = await this.userRepository.findOne({
            where: { email_search_hash: emailHash, deleted_at: IsNull() },
        });

        if (!user) return { message: 'Falls die Email existiert, wurde eine Mail gesendet' };

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(token);

        await this.userRepository.update(user.id, {
            password_reset_token: tokenHash,
            password_reset_expires_at: new Date(Date.now() + 60 * 60 * 1000),
        });

        const contactEmail = decryptField(user.email as Buffer)!;
        try {
            await this.mailService.sendPasswordResetEmail(contactEmail, token);
        } catch {
        }
        return { message: 'Falls die Email existiert, wurde eine Mail gesendet' };
    }

    async resetPassword(token: string, newPassword: string) {
        const tokenHash = this.hashToken(token);

        const user = await this.userRepository.findOne({
            where: {
                password_reset_token: tokenHash,
                password_reset_expires_at: MoreThan(new Date()),
            },
        });

        if (!user) throw new NotFoundException('Token ungültig oder abgelaufen');

        user.password_hash = await hashPassword(newPassword, 12);
        user.password_reset_token = null;
        user.password_reset_expires_at = null;
        await this.userRepository.save(user);

        return { message: 'Passwort erfolgreich geändert' };
    }

    async getAgbVersions(): Promise<AgbVersion[]> {
        return this.agbVersionRepository.find({ where: { is_current: true } });
    }

    async deleteAccount(userId: string): Promise<{ message: string }> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('User nicht gefunden');
        if (user.deleted_at) throw new BadRequestException('Account bereits gelöscht');
        user.deleted_at = new Date();
        await this.refreshTokenRepository.update(
            { user_id: userId },
            { is_revoked: true },
        );
        await this.userRepository.save(user);
        return { message: 'Account erfolgreich gelöscht' };
    }

    async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ message: string }> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('User nicht gefunden');

        const valid = await comparePassword(currentPassword, user.password_hash ?? '');
        if (!valid) throw new UnauthorizedException('Aktuelles Passwort ist falsch');

        const same = await comparePassword(newPassword, user.password_hash ?? '');
        if (same) throw new BadRequestException('Neues Passwort muss sich vom aktuellen unterscheiden');

        user.password_hash = await hashPassword(newPassword, 12);
        await this.userRepository.save(user);

        return { message: 'Passwort erfolgreich geändert' };
    }

    async changeEmail(userId: string, currentPassword: string, newEmail: string): Promise<{ message: string }> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('User nicht gefunden');

        const valid = await comparePassword(currentPassword, user.password_hash ?? '');
        if (!valid) throw new UnauthorizedException('Passwort ist falsch');

        const newEmailHash = this.hashEmail(newEmail);
        const taken = await this.userRepository.findOne({ where: { email_search_hash: newEmailHash } });
        if (taken && taken.id !== userId) throw new ConflictException('Email bereits vergeben');

        // TODO: set is_verified = false and send verification email once Resend domain is verified
        user.email = encryptField(newEmail);
        user.email_search_hash = newEmailHash;
        await this.userRepository.save(user);

        return { message: 'Email erfolgreich geändert' };
    }

    async createConsents(
        userId: string,
        consents: ConsentItemDto[],
        ip: string,
    ): Promise<{ success: true }> {
        const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
        const now = new Date();

        const entries = consents.map((c) =>
            this.consentLogRepository.create({
                user_id: userId,
                agb_version_id: c.agb_version_id,
                accepted: c.accepted,
                accepted_at: now,
                ip_hash: ipHash,
                withdrawn_at: null,
                withdraw_reason: null,
            }),
        );

        await this.consentLogRepository.upsert(entries, {
            conflictPaths: ['user_id', 'agb_version_id'],
            skipUpdateIfNoValuesChanged: false,
        });

        return { success: true };
    }
}