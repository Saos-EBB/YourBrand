import { IsEnum } from 'class-validator';

// Roles assignable by the owner — a subset of auth/entities/user.entity.ts's
// UserRole. 'owner' is intentionally excluded and can't be reached through
// this DTO. Keep these literals in sync with UserRole by hand: TypeScript
// string enums can't be initialized from another enum's members.
export enum AssignableRole {
    USER  = 'user',
    ADMIN = 'admin',
}

export class UpdateUserRoleDto {
    @IsEnum(AssignableRole)
    role!: AssignableRole;
}
