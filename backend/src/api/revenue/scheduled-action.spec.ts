import { scheduledGroupResult } from "./scheduled-action";

describe("scheduled grouped action results", () => {
  it("marks every verified child as verified", () => {
    expect(scheduledGroupResult([{ status: "VERIFIED" }, { status: "VERIFIED" }], 2)).toMatchObject({ status: "VERIFIED", verified: 2 });
  });

  it("preserves partial completion when one child fails verification", () => {
    expect(scheduledGroupResult([{ status: "VERIFIED" }, { status: "FAILED" }], 2)).toMatchObject({ status: "PARTIALLY_APPLIED", verified: 1, failed: 1 });
  });

  it("marks a group failed when no child verifies", () => {
    expect(scheduledGroupResult([{ status: "FAILED" }, { status: "FAILED" }], 2)).toMatchObject({ status: "FAILED", verified: 0, failed: 2 });
  });

  it("marks a fully stale group cancelled instead of failed", () => {
    expect(scheduledGroupResult([{ status: "CANCELLED" }, { status: "CANCELLED" }], 2)).toMatchObject({ status: "CANCELLED", cancelled: 2 });
  });
});
