import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import app from "../../src/app";
import { createTestClient, type TestHttpClient } from "../helpers/http";
import { authHeader, studentToken } from "../helpers/tokens";

describe("Payments API", () => {
  let client: TestHttpClient;

  beforeAll(async () => {
    client = await createTestClient(app);
  });

  afterAll(async () => {
    await client.close();
  });

  test("GET /api/payments/ returns API discovery document", async () => {
    const res = await client.request("GET", "/api/payments/");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success?: boolean;
      data?: { student?: unknown[]; admin?: unknown[] };
    };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.student)).toBe(true);
    expect(Array.isArray(body.data?.admin)).toBe(true);
    expect(body.data!.student!.length).toBeGreaterThan(0);
    expect(body.data!.admin!.length).toBeGreaterThan(0);
  });

  test("GET /api/payments/course/plan/:courseId returns installment plan array", async () => {
    const res = await client.request(
      "GET",
      "/api/payments/course/plan/nonexistent-course-id",
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST /api/payments/payu/callback redirects on invalid hash (web channel)", async () => {
    const res = await client.request("POST", "/api/payments/payu/callback", {
      form: {
        status: "success",
        txnid: "test-txn-id",
        amount: "100.00",
        hash: "invalid-hash-value",
        key: "test-key",
        email: "test@example.com",
        firstname: "Test",
        productinfo: "Test Product",
      },
    });

    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/payment/failure");
  });

  test("POST /api/payments/course/order requires auth", async () => {
    const res = await client.request("POST", "/api/payments/course/order", {
      body: { courseId: "test-course" },
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/payments/course/order validates body when authenticated", async () => {
    const res = await client.request("POST", "/api/payments/course/order", {
      headers: authHeader(studentToken()),
      body: {},
    });
    expect([400, 404, 422]).toContain(res.status);
  });

  test("POST /api/payments/payu/hash requires auth", async () => {
    const res = await client.request("POST", "/api/payments/payu/hash", {
      body: { hashName: "payment_hash", hashString: "test" },
    });
    expect(res.status).toBe(401);
  });

  test("GET /api/payments/history requires auth", async () => {
    const res = await client.request("GET", "/api/payments/history");
    expect(res.status).toBe(401);
  });
});
