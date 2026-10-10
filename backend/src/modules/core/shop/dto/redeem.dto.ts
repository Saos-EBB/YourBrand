import { IsString, Length } from 'class-validator';

export class RedeemCodeDto {
    @IsString() @Length(4, 40)
    code!: string;
}
