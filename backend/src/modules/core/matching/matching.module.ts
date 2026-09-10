import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscoverController } from './discover.controller';
import { MatchingService } from './matching.service';
import { SwipeService } from './swipe.service';
import { Swipe } from './entities/swipe.entity';
import { Match } from './entities/match.entity';
import { Conversation } from '../chat/entities/conversation.entity';
import { Profile } from '../profile/entities/profile.entity';
import { Subscription } from '../payment/entities/subscription.entity';
import { JwtGuard } from '../../../common/guards/jwt.guard';

@Module({
    imports: [
        TypeOrmModule.forFeature([Swipe, Match, Conversation, Profile, Subscription]),
    ],
    controllers: [DiscoverController],
    providers: [MatchingService, SwipeService, JwtGuard],
})
export class MatchingModule {}
