import { RouteClass } from '../../../common/route-class/route-class.decorator';
import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Put,
    Request,
    UploadedFile,
    UseGuards,
    UseInterceptors,
    Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { OptionalJwtGuard } from '../../../common/guards/optional-jwt.guard';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SearchProfileDto } from './dto/search-profile.dto';
import { SubmitSensitiveDataDto } from './dto/submit-sensitive-data.dto';
import { ProfileView, PublicProfile } from './profile.types';

const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/webm'];

@Controller('profile')
export class ProfileController {
    constructor(private readonly profileService: ProfileService) { }

    @Get('interests')
    getInterests() {
        return this.profileService.getInterests();
    }

    @Get('me')
    @UseGuards(JwtGuard)
    getOwnProfile(@Request() req: any): Promise<ProfileView> {
        return this.profileService.getOwnProfileWithPhoto(req.user.sub);
    }

    @Put('me')
    @UseGuards(JwtGuard)
    updateOwnProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
        return this.profileService.updateOwnProfile(req.user.sub, dto);
    }

    @Patch('me/publish')
    @UseGuards(JwtGuard)
    publishProfile(@Request() req: any) {
        return this.profileService.publishProfile(req.user.sub);
    }

    @Get('me/interests')
    @UseGuards(JwtGuard)
    getUserInterests(@Request() req: any) {
        return this.profileService.getUserInterests(req.user.sub);
    }

    @Post('me/interests/:interestId')
    @UseGuards(JwtGuard)
    addInterest(@Request() req: any, @Param('interestId') interestId: string) {
        return this.profileService.addInterest(req.user.sub, interestId);
    }

    @Patch('me/interests/:interestId')
    @UseGuards(JwtGuard)
    updateInterestFlag(
        @Request() req: any,
        @Param('interestId') interestId: string,
        @Body() body: { is_green: boolean },
    ) {
        return this.profileService.updateInterestFlag(req.user.sub, interestId, body.is_green);
    }

    @Delete('me/interests/:interestId')
    @UseGuards(JwtGuard)
    removeInterest(@Request() req: any, @Param('interestId') interestId: string) {
        return this.profileService.removeInterest(req.user.sub, interestId);
    }


    @RouteClass('heavy')
    @Get('search')
    @UseGuards(JwtGuard)
    searchProfiles(@Request() req: any, @Query() query: SearchProfileDto) {
        return this.profileService.searchProfiles(
            req.user.sub,
            query.city,
            query.interests,
            query.gender,
            query.looking_for,
            query.min_age,
            query.max_age,
            query.online_only,
            query.connection_status,
            query.lat,
            query.lng,
            query.radius,
            query.cursor,
        );
    }


    @Post('me/consent/sensitive-data')
    @UseGuards(JwtGuard)
    createSensitiveDataConsent(@Request() req: any) {
        const ip = req.ip ?? '0.0.0.0';
        return this.profileService.createSensitiveDataConsent(req.user.sub, ip);
    }

    @Post('me/sensitive-data')
    @UseGuards(JwtGuard)
    submitSensitiveData(@Request() req: any, @Body() dto: SubmitSensitiveDataDto) {
        return this.profileService.submitSensitiveData(req.user.sub, dto);
    }

    @RouteClass('upload')
    @Post('audio')
    @UseGuards(JwtGuard)
    @UseInterceptors(
        FileInterceptor('audio', {
            storage: memoryStorage(),
            limits: { fileSize: 5 * 1024 * 1024 },
            fileFilter: (_req, file, cb) => {
                const base = file.mimetype.split(';')[0].trim();
                if (ALLOWED_AUDIO_TYPES.includes(base)) {
                    cb(null, true);
                } else {
                    cb(new BadRequestException('Nur MP3, OGG, MP4, WAV und WebM erlaubt'), false);
                }
            },
        }),
    )
    uploadProfileAudio(
        @Request() req: any,
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (!file) throw new BadRequestException('Keine Datei hochgeladen');
        return this.profileService.uploadProfileAudio(req.user.sub, file);
    }

    @Delete('audio')
    @UseGuards(JwtGuard)
    @HttpCode(204)
    deleteProfileAudio(@Request() req: any): Promise<void> {
        return this.profileService.deleteProfileAudio(req.user.sub);
    }

    @Get('me/blocks')
    @UseGuards(JwtGuard)
    getBlocks(@Request() req: any) {
        return this.profileService.getBlocks(req.user.sub);
    }

    @Post('me/block/:userId')
    @UseGuards(JwtGuard)
    blockUser(@Request() req: any, @Param('userId') userId: string) {
        return this.profileService.blockUser(req.user.sub, userId);
    }

    @Delete('me/block/:userId')
    @UseGuards(JwtGuard)
    unblockUser(@Request() req: any, @Param('userId') userId: string) {
        return this.profileService.unblockUser(req.user.sub, userId);
    }

    @Get('user/:userId')
    @UseGuards(JwtGuard)
    getProfileByUserId(@Param('userId') userId: string) {
        return this.profileService.getProfileByUserId(userId);
    }

    @Get(':nickname/interests')
    getPublicProfileInterests(@Param('nickname') nickname: string) {
        return this.profileService.getPublicProfileInterests(nickname);
    }

    @Get(':nickname')
    @UseGuards(OptionalJwtGuard)
    getPublicProfile(@Request() req: any, @Param('nickname') nickname: string): Promise<PublicProfile> {
        return this.profileService.getPublicProfile(nickname, req.user?.sub ?? null);
    }

}