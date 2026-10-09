import { IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { BOARD_KINDS, BOARD_VISIBILITIES } from '../board.constants';
import type { BoardKind, BoardVisibility } from '../board.constants';

export class CreateBoardPostDto {
    @IsIn(BOARD_KINDS)
    kind!: BoardKind;

    @IsString() @Length(3, 80)
    title!: string;

    @IsString() @Length(1, 1000)
    body!: string;

    // Nur der Strassenname, die Hausnummer gehoert nicht hierher
    @IsOptional() @IsString() @MaxLength(80)
    street?: string;

    @IsIn(BOARD_VISIBILITIES)
    visibility!: BoardVisibility;

    // Einwilligung fuer oeffentliche Aushaenge, nur beim ersten Mal noetig
    @IsOptional() @IsBoolean()
    publicConsent?: boolean;
}
