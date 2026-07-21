export type ScheduledChildResult = { status: string };

export function scheduledGroupResult(children: ScheduledChildResult[], expectedChildren: number) {
  const verified = children.filter((item) => item.status === "VERIFIED").length;
  const cancelled = children.filter((item) => item.status === "CANCELLED").length;
  const status = verified === expectedChildren
    ? "VERIFIED"
    : verified > 0
      ? "PARTIALLY_APPLIED"
      : cancelled === expectedChildren
        ? "CANCELLED"
        : "FAILED";
  return { status, verified, cancelled, failed: expectedChildren - verified - cancelled };
}
