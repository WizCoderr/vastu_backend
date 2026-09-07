/**
 * Smoke-test PayU payment creation against a running API.
 *
 * Usage:
 *   TEST_EMAIL=you@example.com TEST_PASSWORD=secret bun run scripts/test-payu-payment.ts
 *
 * Optional:
 *   API_BASE_URL=http://localhost:3030
 *   PAYMENT_TYPE=course|remidies   (default: remidies)
 *   ORDER_ID=uuid
 *   COURSE_ID=uuid
 *
 * This creates a PayU payment request and prints the params.
 * It does NOT complete a live PayU checkout (that needs browser/SDK).
 */

const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3030";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const PAYMENT_TYPE = process.env.PAYMENT_TYPE ?? "remidies";
const COURSE_ID = process.env.COURSE_ID;
const ORDER_ID = process.env.ORDER_ID;

if (!EMAIL || !PASSWORD) {
  console.error("Set TEST_EMAIL and TEST_PASSWORD env vars.");
  process.exit(1);
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${path} → ${res.status}: ${JSON.stringify(body)}`,
    );
  }
  return body as T;
}

async function main() {
  const login = await request<{ token?: string; accessToken?: string; data?: { token?: string } }>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    },
  );
  const token =
    login.token || login.accessToken || login.data?.token;
  if (!token) throw new Error("Login did not return a token");

  console.log("Logged in.");

  if (PAYMENT_TYPE === "course") {
    if (!COURSE_ID) throw new Error("COURSE_ID is required for course payments");
    const order = await request<Record<string, unknown>>(
      "/api/payments/course/order",
      {
        method: "POST",
        token,
        body: JSON.stringify({ courseId: COURSE_ID, channel: "web" }),
      },
    );
    console.log("PayU course payment params:", order);
    return;
  }

  if (!ORDER_ID) {
    throw new Error(
      "ORDER_ID is required for remidies (create a shop order first via checkout)",
    );
  }

  const order = await request<Record<string, unknown>>(
    "/api/payments/remidies/order",
    {
      method: "POST",
      token,
      body: JSON.stringify({ orderId: ORDER_ID, channel: "web" }),
    },
  );
  console.log("PayU remidies payment params:", order);

  if (typeof order.txnid === "string") {
    const status = await request<Record<string, unknown>>(
      `/api/payments/payu/status/${order.txnid}`,
      { token },
    );
    console.log("Initial status:", status);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
