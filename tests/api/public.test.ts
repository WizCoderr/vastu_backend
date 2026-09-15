import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import app from "../../src/app";
import { createTestClient, type TestHttpClient } from "../helpers/http";
import { publicRoutes } from "./routes.manifest";

describe("Public API routes", () => {
  let client: TestHttpClient;

  beforeAll(async () => {
    client = await createTestClient(app);
  });

  afterAll(async () => {
    await client.close();
  });

  for (const route of publicRoutes) {
    test(`${route.method} ${route.path} is reachable without auth`, async () => {
      const path = route.samplePath ?? route.path;
      const res = await client.request(route.method, path);

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(404);

      const contentType = res.headers.get("content-type") ?? "";
      expect(contentType).toContain("application/json");

      const body = await res.json();

      if (route.path === "/api/public/google-reviews") {
        // 503 when Google Places API is not configured — still a valid route
        expect([200, 503]).toContain(res.status);
        return;
      }

      if (route.path.includes("/payments/") && route.path.includes("plan")) {
        expect(res.status).toBe(200);
        expect(Array.isArray(body)).toBe(true);
        return;
      }

      if (route.path.startsWith("/api/")) {
        expect((body as { success?: boolean }).success).toBe(true);
      }
    });
  }

  test("GET /api/public/courses returns course array", async () => {
    const res = await client.request("GET", "/api/public/courses");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { success?: boolean; data?: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /api/public/remidies/categories returns categories array", async () => {
    const res = await client.request("GET", "/api/public/remidies/categories");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { success?: boolean; data?: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});
