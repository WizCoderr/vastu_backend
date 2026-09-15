import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import app from "../../src/app";
import { createTestClient, type TestHttpClient } from "../helpers/http";
import { adminToken, authHeader, studentToken } from "../helpers/tokens";
import { adminRequiredRoutes, authRequiredRoutes } from "./routes.manifest";

describe("Auth guard middleware", () => {
  let client: TestHttpClient;

  beforeAll(async () => {
    client = await createTestClient(app);
  });

  afterAll(async () => {
    await client.close();
  });

  describe("requireAuth routes return 401 without token", () => {
    for (const route of authRequiredRoutes) {
      test(`${route.method} ${route.path}`, async () => {
        const path = route.samplePath ?? route.path;
        const res = await client.request(route.method, path, {
          body: route.method !== "GET" ? {} : undefined,
        });
        expect(res.status).toBe(401);
      });
    }
  });

  describe("requireAdmin routes return 403 for student token", () => {
    const token = studentToken();

    for (const route of adminRequiredRoutes) {
      test(`${route.method} ${route.path}`, async () => {
        const path = route.samplePath ?? route.path;
        const res = await client.request(route.method, path, {
          headers: authHeader(token),
          body: route.method !== "GET" ? {} : undefined,
        });
        expect(res.status).toBe(403);
      });
    }
  });

  describe("requireAdmin routes pass middleware for admin token", () => {
    const token = adminToken();

    for (const route of adminRequiredRoutes) {
      test(`${route.method} ${route.path}`, async () => {
        const path = route.samplePath ?? route.path;
        const res = await client.request(route.method, path, {
          headers: authHeader(token),
          body: route.method !== "GET" ? {} : undefined,
        });
        expect([401, 403]).not.toContain(res.status);
      });
    }
  });
});
