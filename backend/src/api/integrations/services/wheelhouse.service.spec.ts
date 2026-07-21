import { HttpException } from "@nestjs/common";
import { of, throwError } from "rxjs";
import { WheelhouseService } from "./wheelhouse.service";

const config = (values: Record<string, string> = {}) => ({
  get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
});

describe("WheelhouseService write access", () => {
  it("allows an approved live attempt without requiring an environment flag", () => {
    const service = new WheelhouseService(
      { request: jest.fn(() => of({ data: {} })) } as never,
      config({ WHEELHOUSE_API_KEY: "key" }) as never,
    );

    expect(service.capabilities()).toMatchObject({
      writeActions: true,
      writeAccess: "unverified",
    });
    expect(() => service.assertWriteAccess()).not.toThrow();
  });

  it("learns when a configured key is rejected as read-only", async () => {
    const http = {
      request: jest.fn(() =>
        throwError(() => ({
          response: { status: 403, data: { error: "This API key is read-only" } },
        })),
      ),
    };
    const service = new WheelhouseService(
      http as never,
      config({ WHEELHOUSE_API_KEY: "key" }) as never,
    );

    await expect(
      service.updateSetting("listing", "airbnb", "base_price_adjustment", { type: "REC" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(service.capabilities()).toMatchObject({
      writeActions: false,
      writeAccess: "read_only",
      lastError: 403,
    });
  });

  it("marks write access verified only after a real write succeeds", async () => {
    const service = new WheelhouseService(
      { request: jest.fn(() => of({ data: {} })) } as never,
      config({ WHEELHOUSE_API_KEY: "key" }) as never,
    );

    await service.updateSetting("listing", "airbnb", "base_price_adjustment", { type: "REC" });

    expect(service.capabilities()).toMatchObject({
      writeActions: true,
      writeAccess: "verified",
    });
  });

  it("rejects writes when no connection is configured", () => {
    const service = new WheelhouseService(
      { request: jest.fn(() => of({ data: {} })) } as never,
      config() as never,
    );

    expect(service.capabilities()).toMatchObject({ writeActions: false });
    expect(() => service.assertWriteAccess()).toThrow(HttpException);
  });
});
