import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { TelegramService } from "../integrations/services/telegram.service";
import { ApprovalGuard } from "../auth/guards/approval.guard";
import { RevenueController } from "./revenue.controller";
import { RevenueService } from "./revenue.service";

jest.mock("../auth/guards/approval.guard", () => ({ ApprovalGuard: class ApprovalGuard {} }));
jest.mock("../auth/guards/privy-auth.guard", () => ({ PrivyAuthGuard: class PrivyAuthGuard {} }));

describe("RevenueController", () => {
  let controller: RevenueController;
  const revenue = { capabilitiesFor: jest.fn(() => ({ wheelhouse: { connected: true } })), preview: jest.fn(() => ({ mutated: false, source: "Wheelhouse live preview" })), underwrite: jest.fn(() => ({ source: "Wheelhouse live market report" })) };
  beforeEach(async () => { const module = await Test.createTestingModule({ controllers: [RevenueController], providers: [{ provide: RevenueService, useValue: revenue }, { provide: TelegramService, useValue: {} }, { provide: ConfigService, useValue: { get: jest.fn() } }, { provide: ApprovalGuard, useValue: { canActivate: () => true } }] }).compile(); controller = module.get(RevenueController); });
  it("reports organization-scoped live capabilities", () => expect(controller.capabilities({} as any)).toEqual({ wheelhouse: { connected: true } }));
  it("uses a non-mutating live preview", async () => expect(await controller.preview("incident" )).toMatchObject({ mutated: false, source: "Wheelhouse live preview" }));
  it("delegates organization-scoped live underwriting", async () => expect(await controller.underwrite({ address: "1200 Brickell Bay Dr", marketId: 1, acquisitionCost: 500000, annualExpenses: 30000 }, {} as any)).toMatchObject({ source: "Wheelhouse live market report" }));
});
