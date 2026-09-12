import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hashPassword } from '../../../common/bcrypt/bcrypt-pool.helper';
import * as crypto from 'crypto';
import { User, UserRole } from '../auth/entities/user.entity';
import { Profile } from '../profile/entities/profile.entity';
import { encryptField } from '../../../common/crypto/crypto.helper';
import { CreateOwnerDto } from './dto/create-owner.dto';

@Injectable()
export class SetupService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(Profile)
        private readonly profileRepo: Repository<Profile>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) {}

    async getStatus(): Promise<{ setupComplete: boolean }> {
        const [{ count }] = await this.dataSource.query(
            `SELECT COUNT(*) AS count FROM users WHERE role = 'owner'`,
        );
        return { setupComplete: parseInt(count, 10) > 0 };
    }

    async createOwner(dto: CreateOwnerDto): Promise<{ message: string }> {
        const { setupComplete } = await this.getStatus();
        if (setupComplete) throw new ForbiddenException('Setup bereits abgeschlossen');

        const emailHash = this.hashEmail(dto.email);
        const passwordHash = await hashPassword(dto.password, 12);
        const publicId = await this.generatePublicId();

        const user = this.userRepo.create({
            email_search_hash: emailHash,
            email: encryptField(dto.email),
            password_hash: passwordHash,
            role: UserRole.OWNER,
            is_verified: true,
            email_verified_at: new Date(),
            public_id: publicId,
        });
        await this.userRepo.save(user);

        const profile = this.profileRepo.create({
            user_id: user.id,
            nickname: dto.nickname,
            birthdate: '1990-01-01',
            is_published: false,
            onboarding_completed: true,
            updated_at: new Date(),
        });
        await this.profileRepo.save(profile);

        return { message: 'Owner-Account erfolgreich erstellt' };
    }

    private hashEmail(email: string): string {
        if (!process.env.EMAIL_SALT) throw new Error('EMAIL_SALT env var is not set');
        return crypto
            .createHash('sha256')
            .update(email.toLowerCase().trim() + process.env.EMAIL_SALT)
            .digest('hex');
    }

    private async generatePublicId(): Promise<string> {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        for (let attempt = 0; attempt < 100; attempt++) {
            const id = Array.from({ length: 4 }, () => charset[Math.floor(Math.random() * 36)]).join('');
            const existing = await this.userRepo.findOne({ where: { public_id: id } });
            if (!existing) return id;
        }
        throw new Error('Could not generate unique public_id');
    }
}
