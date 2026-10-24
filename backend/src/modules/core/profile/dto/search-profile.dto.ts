import { IsOptional, IsString, IsArray, IsUUID, IsEnum, IsInt, IsNumber, IsBoolean, IsIn, Min, Max, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { GenderOption, LookingForOption } from '../entities/profile.entity';

export class SearchProfileDto {
    @IsOptional()
    @IsString()
    city?: string;

    @IsOptional()
    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    @Min(-90)
    @Max(90)
    lat?: number;

    @IsOptional()
    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    @Min(-180)
    @Max(180)
    lng?: number;

    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10))
    @IsInt()
    @Min(1)
    @Max(5000)
    radius?: number;

    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    @Transform(({ value }) => typeof value === 'string' ? value.split(',') : value)
    interests?: string[];

    @IsOptional()
    @IsEnum(GenderOption)
    gender?: GenderOption;

    @IsOptional()
    @IsEnum(LookingForOption)
    looking_for?: LookingForOption;

    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10))
    @IsInt()
    @Min(0)
    @Max(120)
    min_age?: number;

    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10))
    @IsInt()
    @Min(0)
    @Max(120)
    max_age?: number;

    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean()
    online_only?: boolean;

    @IsOptional()
    @IsIn(['NONE', 'SENT', 'RECEIVED', 'CONNECTED'])
    connection_status?: 'NONE' | 'SENT' | 'RECEIVED' | 'CONNECTED';

    // Cursor aus nextCursor der vorigen Seite
    @IsOptional()
    @IsString()
    @MaxLength(200)
    cursor?: string;
}
