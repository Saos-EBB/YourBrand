import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

// Kaeufer meldet ein Problem mit seiner Bestellung
export const PROBLEM_REASONS = ['not_received', 'wrong_item', 'damaged', 'code_invalid', 'other'] as const;
// Team meldet einen Kaeufer (intern, der Kaeufer sieht das nicht)
export const REPORT_REASONS = ['no_show', 'abuse', 'fraud_suspect', 'other'] as const;
export const CASE_STATUSES = ['open', 'waiting', 'resolved'] as const;
export const CASE_KINDS = ['problem', 'report', 'support', 'dispute', 'not_met'] as const;

export class OpenProblemDto {
    @IsIn(PROBLEM_REASONS)
    reason!: (typeof PROBLEM_REASONS)[number];

    @IsString() @Length(10, 2000, { message: 'Beschreibung: 10–2000 Zeichen' })
    message!: string;
}

export class CaseMessageDto {
    @IsString() @Length(1, 2000, { message: 'Nachricht: 1–2000 Zeichen' })
    body!: string;
}

export class AdminCaseMessageDto extends CaseMessageDto {
    // Notiz nur fuers Team
    @IsOptional() @IsBoolean()
    internal?: boolean;
}

export class ResolveCaseDto {
    @IsString() @Length(5, 1000, { message: 'Ergebnis: 5–1000 Zeichen' })
    resolution!: string;
}

export class ReportBuyerDto {
    @IsIn(REPORT_REASONS)
    reason!: (typeof REPORT_REASONS)[number];

    @IsString() @Length(10, 2000, { message: 'Beschreibung: 10–2000 Zeichen' })
    note!: string;
}

export class AdminListCasesQuery {
    // 'active' = offen + wartet
    @IsOptional() @IsIn(['active', ...CASE_STATUSES, 'all'])
    status?: 'active' | (typeof CASE_STATUSES)[number] | 'all';

    @IsOptional() @IsIn(CASE_KINDS)
    kind?: (typeof CASE_KINDS)[number];

    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
    page?: number;
}
