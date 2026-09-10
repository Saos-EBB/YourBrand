import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../../core/auth/entities/user.entity';
import { Tooth } from './entities/tooth.entity';
import { ToothChain } from './entities/tooth-chain.entity';

@Injectable()
export class TeethService {
    constructor(
        @InjectRepository(Tooth)
        private readonly toothRepo: Repository<Tooth>,
        @InjectRepository(ToothChain)
        private readonly chainRepo: Repository<ToothChain>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) { }

    async getTeeth(userId: string): Promise<Tooth[]> {
        return this.toothRepo.find({
            where: { owner_id: userId, converted_to_chain: false },
        });
    }

    async getChains(userId: string): Promise<ToothChain[]> {
        return this.chainRepo.find({ where: { user_id: userId } });
    }

    async awardTooth(ownerId: string, fromUserId: string, beefId: string): Promise<void> {
        await this.toothRepo.save(
            this.toothRepo.create({
                owner_id: ownerId,
                from_user_id: fromUserId,
                beef_id: beefId,
            })
        );
    }

    // FOR UPDATE inside a transaction: a concurrent transform() call for the
    // same user blocks on the SELECT until this one commits, then re-reads
    // converted_to_chain = false and correctly sees fewer than 15 left —
    // without the lock, two concurrent calls could both select and convert
    // the same 15 teeth into two separate chains.
    async transform(userId: string): Promise<ToothChain> {
        return this.dataSource.transaction(async (manager) => {
            const rows = await manager.query<{ id: string }[]>(
                `SELECT id FROM teeth
                 WHERE owner_id = $1 AND converted_to_chain = false
                 ORDER BY created_at ASC
                 LIMIT 15
                 FOR UPDATE`,
                [userId],
            );
            if (rows.length < 15)
                throw new BadRequestException('Nicht genug Zähne (braucht 15)');

            await manager.query(
                `UPDATE teeth SET converted_to_chain = true WHERE id = ANY($1::uuid[])`,
                [rows.map((r) => r.id)],
            );
            return manager.save(manager.create(ToothChain, { user_id: userId }));
        });
    }
}
