import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class UnderwriteDto {
  @IsString() @IsNotEmpty() address!: string;
  @IsInt() @Min(1) marketId!: number;
  @IsNumber() @Min(1) acquisitionCost!: number;
  @IsNumber() @Min(0) annualExpenses!: number;
}

export class ResolveDto { @IsOptional() @IsString() approvedBy?: string; }
