import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GdprService } from './gdpr.service';
import { GdprController } from './gdpr.controller';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { GDPR_EXPORT_QUEUE, DEFAULT_JOB_OPTIONS } from '../../../common/queue/queue.constants';

@Module({
    imports: [
        // TypeOrmModule.forFeature([User]) removed — GdprService never
        // actually used the injected userRepo, only raw dataSource queries.
        BullModule.registerQueue({ name: GDPR_EXPORT_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    ],
    controllers: [GdprController],
    providers: [GdprService, JwtGuard],
})
export class GdprModule {}
