import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class MyOrdersQuery {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
    page?: number;
}
