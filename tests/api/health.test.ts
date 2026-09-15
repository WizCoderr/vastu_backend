import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import app from "../../src/app";
import { createTestClient, type TestHttpClient } from "../helpers/http";

describe("Health & root API", () => {
  let client: TestHttpClient;

  beforeAll(async () => {
    client = await createTestClient(app);
  });

  afterAll(async () => {
    await client.close();
  });

  test("GET / returns API welcome message", async () => {
    const res = await client.request("GET", "/");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { message?: string; version?: string };
    expect(body.message).toContain("Vastu Backend API");
    expect(body.version).toBeDefined();
  });

  test("GET /health returns ok status", async () => {
    const res = await client.request("GET", "/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status?: string;
      paymentProvider?: string;
      timestamp?: string;
    };
    expect(body.status).toBe("ok");
    expect(body.paymentProvider).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  test("GET /unknown-route returns 404", async () => {
    const res = await client.request("GET", "/this-route-does-not-exist");
    expect(res.status).toBe(404);
  });
});
