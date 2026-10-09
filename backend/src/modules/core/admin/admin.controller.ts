import {
    Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe,
    ParseUUIDPipe, Patch, Post, Query, Request, UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { OwnerGuard } from '../../../common/guards/owner.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { parseAnalyticsRange } from './dashboard-analytics.query';
import { SetVulnerableFlagDto } from './dto/set-vulnerable-flag.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { AdminCreateStrikeDto } from './dto/admin-create-strike.dto';
import { AddProfanityWordDto } from './dto/add-profanity-word.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateUserEmailDto } from './dto/update-user-email.dto';
import { RejectMediaDto } from '../moderation/dto/reject-media.dto';

@Controller('admin')
@UseGuards(JwtGuard, RolesGuard)
@Roles('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) {}

    // ── Media moderation ───────────────────────────────────────────────────────

    @Get('media/pending')
    getMediaPending() {
        return this.adminService.getMediaPending();
    }

    @Patch('media/:id/approve')
    approveMedia(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.adminService.approveMedia(req.user.sub, id);
    }

    @Patch('media/:id/reject')
    rejectMedia(
        @Request() req: any,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: RejectMediaDto,
    ) {
        return this.adminService.rejectMedia(req.user.sub, id, dto.reason);
    }

    // ── User management ────────────────────────────────────────────────────────

    @Post('users/create')
    @UseGuards(OwnerGuard)
    createAdminUser(@Body() dto: CreateAdminUserDto) {
        return this.adminService.createAdminUser(dto);
    }

    @Get('users')
    getUsers(
        @Query('role') role?: string,
        @Query('is_banned') isBanned?: string,
        @Query('search') search?: string,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        return this.adminService.getUsers({
            role,
            is_banned: isBanned === 'true' ? true : isBanned === 'false' ? false : undefined,
            search,
            page:  Math.max(1, parseInt(page,  10) || 1),
            limit: Math.min(100, parseInt(limit, 10) || 20),
        });
    }

    @Patch('users/:id/ban')
    banUser(
        @Request() req: any,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: BanUserDto,
    ) {
        return this.adminService.banUser(req.user.sub, req.user.role, id, dto);
    }

    @Patch('users/:id/unban')
    unbanUser(@Param('id', ParseUUIDPipe) id: string) {
        return this.adminService.unbanUser(id);
    }

    @Patch('users/:id/role')
    @UseGuards(OwnerGuard)
    setUserRole(
        @Request() req: any,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateUserRoleDto,
    ) {
        return this.adminService.setUserRole(req.user.sub, id, dto);
    }

    @Patch('users/:id/vulnerable-flag')
    setVulnerableFlag(
        @Param('id') id: string,
        @Body() dto: SetVulnerableFlagDto,
    ) {
        return this.adminService.setVulnerableFlag(id, dto.vulnerable_flag);
    }

    @Get('users/:id/export')
    exportUserData(@Param('id', ParseUUIDPipe) id: string) {
        return this.adminService.exportUserData(id);
    }

    @Post('users/:id/send-password-reset')
    @HttpCode(HttpStatus.OK)
    sendPasswordReset(@Param('id', ParseUUIDPipe) id: string) {
        return this.adminService.sendPasswordReset(id);
    }

    @Patch('users/:id/email')
    updateUserEmail(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateUserEmailDto,
    ) {
        return this.adminService.updateUserEmail(id, dto);
    }

    // ── Reports ────────────────────────────────────────────────────────────────

    @Get('reports')
    getReports(
        @Query('status') status?: string,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        return this.adminService.getAdminReports({
            status,
            page:  Math.max(1, parseInt(page,  10) || 1),
            limit: Math.min(100, parseInt(limit, 10) || 20),
        });
    }

    @Patch('reports/:id')
    updateReport(
        @Request() req: any,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateReportDto,
    ) {
        return this.adminService.updateReport(req.user.sub, id, dto);
    }

    // ── Strikes ────────────────────────────────────────────────────────────────

    @Get('strikes')
    getStrikes(
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        return this.adminService.getAdminStrikes({
            page:  Math.max(1, parseInt(page,  10) || 1),
            limit: Math.min(100, parseInt(limit, 10) || 20),
        });
    }

    @Post('strikes')
    createStrike(@Request() req: any, @Body() dto: AdminCreateStrikeDto) {
        return this.adminService.createAdminStrike(req.user.sub, dto);
    }

    // ── Profanity word list ────────────────────────────────────────────────────

    @Get('profanity')
    getProfanityWords() {
        return this.adminService.getProfanityWords();
    }

    @Post('profanity')
    addProfanityWord(@Request() req: any, @Body() dto: AddProfanityWordDto) {
        return this.adminService.addProfanityWord(dto, req.user.sub);
    }

    @Delete('profanity/:word')
    removeProfanityWord(@Param('word') word: string) {
        return this.adminService.removeProfanityWord(word);
    }

    // ── Direct conversations ───────────────────────────────────────────────────

    @Post('conversations')
    createDirectConversation(
        @Request() req: any,
        @Body('target_user_id', ParseUUIDPipe) targetUserId: string,
    ) {
        return this.adminService.createDirectConversation(req.user.sub, targetUserId);
    }

    // ── Admin tickets ──────────────────────────────────────────────────────────

    @Get('tickets')
    getAdminTickets(
        @Query('type')   type?: string,
        @Query('status') status?: string,
        @Query('page')   page  = '1',
        @Query('limit')  limit = '20',
    ) {
        return this.adminService.getAdminTickets({
            type,
            status,
            page:  Math.max(1,   parseInt(page,  10) || 1),
            limit: Math.min(100, parseInt(limit, 10) || 20),
        });
    }

    @Patch('tickets/:id/status')
    updateAdminTicketStatus(
        @Param('id', ParseUUIDPipe) id: string,
        @Body('status') status: string,
    ) {
        return this.adminService.updateAdminTicketStatus(id, status);
    }

    // ── Dashboard stats ────────────────────────────────────────────────────────

    @Get('dashboard/user-stats')
    getUserDashboardStats(@Request() req: any) {
        return this.adminService.getUserDashboardStats(req.user.sub);
    }

    @Get('dashboard/admin-stats')
    @Roles('admin')
    getAdminStats() {
        return this.adminService.getAdminStats();
    }

    @Get('dashboard/stats')
    @UseGuards(OwnerGuard)
    getDashboardStats() {
        return this.adminService.getDashboardStats();
    }

    @Get('dashboard/analytics')
    @UseGuards(OwnerGuard)
    getDashboardAnalytics(@Query('days') days?: string) {
        return this.adminService.getDashboardAnalytics(parseAnalyticsRange(days));
    }

    // ── Admin management (owner only) ─────────────────────────────────────────

    @Get('admins')
    @UseGuards(OwnerGuard)
    getAdmins(
        @Query('page')  page  = '1',
        @Query('limit') limit = '20',
    ) {
        return this.adminService.getAdmins({
            page:  Math.max(1,   parseInt(page,  10) || 1),
            limit: Math.min(100, parseInt(limit, 10) || 20),
        });
    }

    // ── Owner: coin & cash transactions ──────────────────────────────────────

    @Get('owner/coin-transactions')
    @UseGuards(OwnerGuard)
    getCoinTransactions() {
        return this.adminService.getCoinTransactions();
    }

    @Get('owner/cash-transactions')
    @UseGuards(OwnerGuard)
    getCashTransactions() {
        return this.adminService.getCashTransactions();
    }

    // ── System settings (owner only) ──────────────────────────────────────────

    @Get('settings')
    @UseGuards(OwnerGuard)
    getSettings() {
        return this.adminService.getSettings();
    }

    @Patch('settings/:key')
    @UseGuards(OwnerGuard)
    updateSetting(
        @Request() req: any,
        @Param('key') key: string,
        @Body() dto: UpdateSettingDto,
    ) {
        return this.adminService.updateSetting(key, dto.value, req.user.sub);
    }
}
