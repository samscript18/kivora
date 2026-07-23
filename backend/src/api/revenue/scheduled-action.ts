export type ScheduledChildResult = { status: string };

export function scheduledGroupResult(children: ScheduledChildResult[], expectedChildren: number) {
  const verified = children.filter((item) => item.status === "VERIFIED").length;
  const applied = children.filter((item) => item.status === "APPLIED").length;
  const cancelled = children.filter((item) => item.status === "CANCELLED").length;
  const successful = verified + applied;
  const status = verified === expectedChildren
    ? "VERIFIED"
    : successful === expectedChildren
      ? "APPLIED"
      : successful > 0
      ? "PARTIALLY_APPLIED"
      : cancelled === expectedChildren
        ? "CANCELLED"
        : "FAILED";
  return { status, verified, applied, cancelled, failed: expectedChildren - successful - cancelled };
}

export type PricingStrategy = "conservative" | "balanced" | "aggressive";

export function recommendedPricingStrategy(recommendation: Record<string, any> | null | undefined, entity?: Record<string, any> | null): PricingStrategy | undefined {
  const candidates = [
    recommendation?.recommendedStrategy,
    entity?.suggested?.strategy,
    entity?.suggested?.action,
    recommendation?.impactCalculation?.inputs?.suggested?.strategy,
    recommendation?.impactCalculation?.inputs?.suggested?.action,
  ];
  for (const candidate of candidates) {
    const match = String(candidate || "").toLowerCase().match(/\b(conservative|balanced|aggressive)\b/);
    if (match) return match[1] as PricingStrategy;
  }
  return undefined;
}
