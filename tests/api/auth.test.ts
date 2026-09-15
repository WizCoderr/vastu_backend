import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import app from "../../src/app";
import { createTestClient, type TestHttpClient } from "../helpers/http";
import { authHeader, studentToken } from "../helpers/tokens";

describe("Auth API", () => {
  let client: TestHttpClient;

  beforeAll(async () => {
    client = await createTestClient(app);
  });

  afterAll(async () => {
    await client.close();
  });

  test("POST /auth/login rejects empty body with 400", async () => {
    const res = await client.request("POST", "/auth/login", { body: {} });
    expect(res.status).toBe(400);

    const body = (await res.json()) as { success?: boolean };
    expect(body.success).toBe(false);
  });

  test("POST /auth/login rejects invalid email with 400", async () => {
    const res = await client.request("POST", "/auth/login", {
      body: { email: "not-an-email", password: "secret123" },
    });
    expect(res.status).toBe(400);
  });

  test("POST /auth/register rejects missing fields with 400", async () => {
    const res = await client.request("POST", "/auth/register", {
      body: { email: "user@example.com" },
    });
    expect(res.status).toBe(400);
  });

  test("POST /auth/register rejects invalid phone with 400", async () => {
    const res = await client.request("POST", "/auth/register", {
      body: {
        email: "user@example.com",
        password: "secret123",
        name: "Test User",
        phoneNumber: "123",
      },
    });
    expect(res.status).toBe(400);
  });

  test("POST /auth/forgot-password rejects invalid email with 400", async () => {
    const res = await client.request("POST", "/auth/forgot-password", {
      body: { email: "bad-email" },
    });
    expect(res.status).toBe(400);
  });

  test("POST /auth/verify-reset-otp rejects malformed otp with 400", async () => {
    const res = await client.request("POST", "/auth/verify-reset-otp", {
      body: { email: "user@example.com", otp: "abc" },
    });
    expect(res.status).toBe(400);
  });

  test("POST /auth/reset-password rejects missing token with 400", async () => {
    const res = await client.request("POST", "/auth/reset-password", {
      body: { password: "newsecret123" },
    });
    expect(res.status).toBe(400);
  });

  test("POST /auth/refresh rejects missing refreshToken with 400", async () => {
    const res = await client.request("POST", "/auth/refresh", { body: {} });
    expect(res.status).toBe(400);

    const body = (await res.json()) as { success?: boolean; error?: unknown };
    expect(body.success).toBe(false);
  });

  test("GET /auth/me rejects missing token with 401", async () => {
    const res = await client.request("GET", "/auth/me");
    expect(res.status).toBe(401);
  });

  test("GET /auth/me rejects invalid token with 401", async () => {
    const res = await client.request("GET", "/auth/me", {
      headers: { Authorization: "Bearer not-a-valid-jwt" },
    });
    expect(res.status).toBe(401);
  });

  test("GET /auth/me accepts valid token (passes auth middleware)", async () => {
    const res = await client.request("GET", "/auth/me", {
      headers: authHeader(studentToken()),
    });
    // User may not exist in DB — 404 is fine; 401 would mean auth failed
    expect([200, 404]).toContain(res.status);
  });

  test("POST /auth/login with unknown user returns 401", async () => {
    const res = await client.request("POST", "/auth/login", {
      body: {
        email: "nonexistent-user@example.com",
        password: "wrongpassword",
      },
    });
    expect(res.status).toBe(401);
  });
});
