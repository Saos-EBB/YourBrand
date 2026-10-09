import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class InviteClientDto {
    // Spitzname der Person, die betreut werden soll
    @IsString() @Matches(/^[a-zA-Z0-9_\-.]{3,30}$/)
    nickname!: string;

    @IsBoolean()
    can_read_chat!: boolean;

    @IsBoolean()
    can_set_protection!: boolean;

    @IsOptional() @IsDateString()
    expires_at?: string;

    // Betreuung im Namen einer Organisation (Modul orgs)
    @IsOptional() @IsUUID()
    org_id?: string;
}

export class UpdateRightsDto {
    @IsOptional() @IsBoolean()
    can_read_chat?: boolean;

    @IsOptional() @IsBoolean()
    can_set_protection?: boolean;
}

export class DecideDto {
    @IsBoolean()
    approve!: boolean;
}

export class ProtectionDto {
    @IsBoolean()
    enhanced_protection!: boolean;
}

export class CreateOrgDto {
    @IsString() @Length(2, 100)
    name!: string;

    @IsOptional() @IsString() @Length(0, 2000)
    description?: string;
}

export class AddMemberDto {
    @IsString() @Matches(/^[a-zA-Z0-9_\-.]{3,30}$/)
    nickname!: string;

    @IsOptional() @IsString() @Matches(/^(admin|member)$/)
    role?: 'admin' | 'member';
}
