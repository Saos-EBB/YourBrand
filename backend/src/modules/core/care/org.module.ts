import { Module } from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { CareModule } from './care.module';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';

// Organisationen (Mandanten-Modul "orgs", setzt "caretaker" voraus)
@Module({
    imports: [CareModule],
    controllers: [OrgController],
    providers: [OrgService, JwtGuard],
})
export class OrgModule { }
