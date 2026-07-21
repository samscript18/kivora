import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UnderwriteDto {
  @IsString() @IsNotEmpty() address!: string;
  @IsInt() @Min(1) marketId!: number;
  @IsNumber() @Min(1) acquisitionCost!: number;
  @IsNumber() @Min(0) annualExpenses!: number;
}

export class ResolveDto { @IsOptional() @IsString() approvedBy?: string; }
export class StrategyDto { @IsIn(["conservative", "balanced", "aggressive"]) strategy!: "conservative" | "balanced" | "aggressive"; }
export class AskDto { @IsString() @IsNotEmpty() @MaxLength(500) question!: string; }
