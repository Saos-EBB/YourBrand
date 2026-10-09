// Decorator-Metadaten: in Nest laedt das der Bootstrap, in Seeds/Jest nicht.
import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
    ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional,
    IsString, Length, Matches, Max, Min, ValidateNested,
} from 'class-validator';
import { TENANT_LOCALES, TENANT_TIERS } from './tenant.types';
import type { TenantLocale, TenantTier } from './tenant.types';

// Rohform von tenants/<slug>/tenant.json. Wird mit whitelist +
// forbidNonWhitelisted validiert: ein Tippfehler im Key (z.B. "modlues")
// bricht den Boot ab, statt still ignoriert zu werden.

// Nur Dateinamen, keine Pfade — die Assets liegen neben tenant.json.
const FILE_NAME = /^[\w-]+\.[a-z0-9]+$/i;

class BrandSchema {
    @IsString() @Length(1, 60)
    name!: string;

    @IsOptional() @Matches(FILE_NAME)
    logo?: string;

    @IsOptional() @Matches(FILE_NAME)
    favicon?: string;
}

class ThemeSchema {
    @IsIn(['dark', 'light'])
    default!: 'dark' | 'light';

    // Inhalt wird im Loader geprueft (Keys/Werte), class-validator kann
    // Record-Eintraege nicht direkt validieren.
    @IsOptional() @IsObject()
    tokens?: Record<string, string>;
}

class LocaleSchema {
    @IsIn(TENANT_LOCALES)
    default!: TenantLocale;

    @IsArray() @ArrayMinSize(1) @IsIn(TENANT_LOCALES, { each: true })
    available!: TenantLocale[];
}

class ModulesSchema {
    @IsOptional() @IsBoolean() chat?: boolean;
    @IsOptional() @IsBoolean() matching?: boolean;
    @IsOptional() @IsBoolean() payments?: boolean;
    @IsOptional() @IsBoolean() hidden?: boolean;
}

class LegalSchema {
    @IsString() @Length(1, 120)
    name!: string;

    @IsString() @Length(1, 300)
    address!: string;

    @IsEmail()
    email!: string;
}

export class TenantConfigSchema {
    @Matches(/^[a-z][a-z0-9-]{1,30}$/)
    slug!: string;

    @ValidateNested() @Type(() => BrandSchema)
    brand!: BrandSchema;

    @ValidateNested() @Type(() => ThemeSchema)
    theme!: ThemeSchema;

    @ValidateNested() @Type(() => LocaleSchema)
    locale!: LocaleSchema;

    @IsIn(TENANT_TIERS)
    tier!: TenantTier;

    @IsOptional() @ValidateNested() @Type(() => ModulesSchema)
    modules?: ModulesSchema;

    @ValidateNested() @Type(() => LegalSchema)
    legal!: LegalSchema;

    @IsOptional() @Matches(/^[a-z][a-z0-9-]{1,30}$/)
    seed?: string;

    // Demo: so viele Tage "laeuft" der Mandant schon (seed-backdate.ts)
    @IsOptional() @IsInt() @Min(1) @Max(3650)
    seedAgeDays?: number;
}
