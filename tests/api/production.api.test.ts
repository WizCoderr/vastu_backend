/**
 * Live smoke tests against https://api.vastuarunsharma.com
 *
 * Run:  bun run test:production
 * Optional authenticated login test (does not register users):
 *   PROD_TEST_EMAIL=... PROD_TEST_PASSWORD=... bun run test:production
 */
import { describe, expect, test } from "bun:test";
import {
  createRemoteClient,
  PRODUCTION_API_BASE,
} from "../helpers/remote-client";
import {
  adminRequiredRoutes,
  authRequiredRoutes,
  publicRoutes,
} from "./routes.manifest";

const client = createRemoteClient();
const prodTestEmail = process.env.PROD_TEST_EMAIL?.trim().toLowerCase();
const prodTestPassword = process.env.PROD_TEST_PASSWORD;

describe(`Production API (${PRODUCTION_API_BASE})`, () => {
  test("API is reachable", async () => {
    const res = await client.request("GET", "/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status?: string };
    expect(body.status).toBe("ok");
  });

  test("GET / returns welcome payload", async () => {
    const res = await client.request("GET", "/");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { message?: string; version?: string };
    expect(body.message).toContain("Vastu Backend API");
    expect(body.version).toBeDefined();
  });

  describe("public routes", () => {
    for (const route of publicRoutes) {
      test(`${route.method} ${route.path}`, async () => {
        const path = route.samplePath ?? route.path;
        const res = await client.request(route.method, path);

        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(404);

        const contentType = res.headers.get("content-type") ?? "";
        expect(contentType).toContain("application/json");

        if (route.path === "/api/public/google-reviews") {
          expect([200, 503]).toContain(res.status);
          return;
        }

        if (route.path.includes("/payments/") && route.path.includes("plan")) {
          expect(res.status).toBe(200);
          expect(Array.isArray(await res.json())).toBe(true);
          return;
        }

        if (route.path.startsWith("/api/")) {
          const body = (await res.json()) as { success?: boolean };
          expect(body.success).toBe(true);
        }
      });
    }
  });

  describe("auth validation", () => {
    test("POST /auth/login rejects empty body with 400", async () => {
      const res = await client.request("POST", "/auth/login", { body: {} });
      expect(res.status).toBe(400);

      const body = (await res.json()) as { success?: boolean };
      expect(body.success).toBe(false);
    });

    test("POST /auth/login rejects invalid credentials with 401", async () => {
      const res = await client.request("POST", "/auth/login", {
        body: {
          email: "production-smoke-test@example.com",
          password: "definitely-not-a-real-password",
        },
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { success?: boolean; error?: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe("Invalid credentials");
    });

    test("POST /auth/register rejects missing fields with 400", async () => {
      const res = await client.request("POST", "/auth/register", {
        body: { email: "user@example.com" },
      });
      expect(res.status).toBe(400);
    });

    test("GET /auth/me rejects missing token with 401", async () => {
      const res = await client.request("GET", "/auth/me");
      expect(res.status).toBe(401);
    });

    test("GET /auth/me rejects invalid token with 401", async () => {
      const res = await client.request("GET", "/auth/me", {
        headers: { Authorization: "Bearer invalid-token" },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("auth guards (unauthenticated)", () => {
    for (const route of authRequiredRoutes) {
      test(`${route.method} ${route.path} → 401`, async () => {
        const path = route.samplePath ?? route.path;
        const res = await client.request(route.method, path, {
          body: route.method !== "GET" ? {} : undefined,
        });
        expect(res.status).toBe(401);
      });
    }

    for (const route of adminRequiredRoutes) {
      test(`${route.method} ${route.path} → denied without token`, async () => {
        const path = route.samplePath ?? route.path;
        const res = await client.request(route.method, path, {
          body: route.method !== "GET" ? {} : undefined,
        });
        // requireAdmin returns 403 when no/invalid token; requireAuth returns 401
        expect([401, 403]).toContain(res.status);
      });
    }
  });

  describe("payments", () => {
    test("GET /api/payments/ returns discovery document", async () => {
      const res = await client.request("GET", "/api/payments/");
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        success?: boolean;
        data?: { student?: unknown[]; admin?: unknown[] };
      };
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data?.student)).toBe(true);
      expect(Array.isArray(body.data?.admin)).toBe(true);
    });

    test("POST /api/payments/payu/callback redirects on invalid hash", async () => {
      const res = await client.request("POST", "/api/payments/payu/callback", {
        form: {
          status: "success",
          txnid: "prod-smoke-txn",
          amount: "1.00",
          hash: "invalid-hash",
          key: "test-key",
          email: "test@example.com",
          firstname: "Test",
          productinfo: "Smoke Test",
        },
      });

      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/payment/failure");
    });
  });

  describe("catalog data", () => {
    test("GET /api/public/courses returns an array", async () => {
      const res = await client.request("GET", "/api/public/courses");
      expect(res.status).toBe(200);

      const body = (await res.json()) as { success?: boolean; data?: unknown[] };
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    test("GET /api/public/remidies/categories returns an array", async () => {
      const res = await client.request("GET", "/api/public/remidies/categories");
      expect(res.status).toBe(200);

      const body = (await res.json()) as { success?: boolean; data?: unknown[] };
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("optional live login (PROD_TEST_EMAIL + PROD_TEST_PASSWORD)", () => {
    test("POST /auth/login succeeds for configured test account", async () => {
      if (!prodTestEmail || !prodTestPassword) {
        console.warn(
          "Skipping live login test — set PROD_TEST_EMAIL and PROD_TEST_PASSWORD to enable",
        );
        return;
      }

      const loginRes = await client.request("POST", "/auth/login", {
        body: { email: prodTestEmail, password: prodTestPassword },
      });

      expect(loginRes.status).toBe(200);

      const loginBody = (await loginRes.json()) as {
        success?: boolean;
        data?: { token?: string; user?: { email?: string } };
      };

      expect(loginBody.success).toBe(true);
      expect(typeof loginBody.data?.token).toBe("string");
      expect(loginBody.data?.user?.email).toBe(prodTestEmail);

      const meRes = await client.request("GET", "/auth/me", {
        headers: { Authorization: `Bearer ${loginBody.data!.token}` },
      });

      expect(meRes.status).toBe(200);

      const meBody = (await meRes.json()) as {
        success?: boolean;
        data?: { email?: string };
      };
      expect(meBody.success).toBe(true);
      expect(meBody.data?.email).toBe(prodTestEmail);
    });
  });
}, 30_000);
