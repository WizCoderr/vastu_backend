export const PRODUCTION_API_BASE =
  process.env.PRODUCTION_API_BASE?.replace(/\/$/, "") ||
  "https://api.vastuarunsharma.com";

export type RemoteResponse = {
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

export type RemoteClient = {
  baseUrl: string;
  request: (
    method: string,
    path: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      form?: Record<string, string>;
    },
  ) => Promise<RemoteResponse>;
};

export function createRemoteClient(baseUrl = PRODUCTION_API_BASE): RemoteClient {
  const normalizedBase = baseUrl.replace(/\/$/, "");

  return {
    baseUrl: normalizedBase,
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

      const response = await fetch(`${normalizedBase}${path}`, {
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
  };
}
