import http from "node:http";
import type { Server } from "node:http";
import type { Express } from "express";

export type TestHttpClient = {
  baseUrl: string;
  request: (
    method: string,
    path: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      form?: Record<string, string>;
    },
  ) => Promise<{ status: number; headers: Headers; json: () => Promise<unknown>; text: () => Promise<string> }>;
  close: () => Promise<void>;
};

export async function createTestClient(app: Express): Promise<TestHttpClient> {
  const server: Server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    async request(method, path, options = {}) {
      const headers: Record<string, string> = { ...(options.headers ?? {}) };

      let body: BodyInit | undefined;
      if (options.form) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        body = new URLSearchParams(options.form).toString();
      } else if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(options.body);
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body,
        redirect: "manual",
      });

      return {
        status: response.status,
        headers: response.headers,
        json: () => response.json(),
        text: () => response.text(),
      };
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
