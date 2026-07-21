import { IsDateString, IsIn, IsMongoId, IsNotEmpty, IsOptional, IsString, IsTimeZone, Length, Matches, MaxLength } from "class-validator";

export class CreateConnectionDto { @IsString() @IsNotEmpty() @MaxLength(100) displayName!: string; @IsString() @Length(8, 1000) credential!: string; }
export class ReplaceCredentialDto { @IsString() @Length(8, 1000) credential!: string; }
export class RecommendationDecisionDto { @IsOptional() @IsString() @MaxLength(500) reason?: string; @IsOptional() @IsDateString() until?: string; }
export class ScheduleRecommendationDto { @IsDateString() executeAt!: string; @IsOptional() @IsString() @MaxLength(500) reason?: string; @IsOptional() @IsMongoId() simulationId?: string; }
export class TransitionRecommendationDto { @IsIn(["review", "approve", "ignore", "dismiss", "reopen", "cancel"]) decision!: string; @IsOptional() @IsString() @MaxLength(500) reason?: string; @IsOptional() @IsDateString() until?: string; }
export class CreatePortfolioDto { @IsMongoId() connectionId!: string; @IsString() @IsNotEmpty() @MaxLength(100) name!: string; @IsOptional() @IsString() @MaxLength(500) description?: string; @IsOptional() @Matches(/^[A-Z]{3}$/) defaultCurrency?: string; @IsOptional() @IsTimeZone() timezone?: string; }
export class MoveListingDto { @IsMongoId() portfolioId!: string; }
export class AssignWorkItemDto { @IsOptional() @IsMongoId() userId?: string; }
export class CommentDto { @IsString() @IsNotEmpty() @MaxLength(2000) body!: string; }
export class ExecuteRecommendationDto { @IsMongoId() simulationId!: string; }
