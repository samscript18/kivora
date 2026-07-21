import { HttpException } from "@nestjs/common";
import { of, throwError } from "rxjs";
import { WheelhouseService } from "./wheelhouse.service";

const config = (values: Record<string, string> = {}) => ({
  get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
});

describe("WheelhouseService write access", () => {
  it("defaults to safe read-only mode without probing through a mutation", () => {
    const service = new WheelhouseService(
      { request: jest.fn(() => of({ data: {} })) } as never,
      config({ WHEELHOUSE_API_KEY: "key" }) as never,
    );

    expect(service.capabilities()).toMatchObject({
      writeActions: false,
      writeAccess: "read_only",
    });
    expect(() => service.assertWriteAccess()).toThrow(HttpException);
  });

  it("learns when an enabled key is rejected as read-only", async () => {
    const http = {
      request: jest.fn(() =>
        throwError(() => ({
          response: { status: 403, data: { error: "This API key is read-only" } },
        })),
      ),
    };
    const service = new WheelhouseService(
      http as never,
      config({ WHEELHOUSE_API_KEY: "key", WHEELHOUSE_WRITE_ENABLED: "true" }) as never,
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
});
