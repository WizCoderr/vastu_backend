/**
 * End-to-end UPI payment test against a running API + worker.
 *
 * Usage:
 *   TEST_EMAIL=you@example.com TEST_PASSWORD=secret bun run test:payment
 *   PAYMENT_TYPE=remidies TEST_EMAIL=... TEST_PASSWORD=... bun run test:payment
 *
 * Optional:
 *   API_BASE_URL=http://localhost:3030
 *   PAYMENT_TYPE=course|remidies   (default: remidies)
 *   COURSE_ID=uuid                 # skip auto-pick from public catalog
 *   PRODUCT_ID=uuid                # skip auto-pick from remedies catalog
 *   ORDER_ID=uuid                  # skip cart/checkout (remidies only)
 *
 * Requires:
 *   - API on PORT (default 3030)
 *   - Redis + payment worker (mock provider auto-completes after ~15s)
 */

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3030';
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const PAYMENT_TYPE = process.env.PAYMENT_TYPE ?? 'remidies';
const COURSE_ID = process.env.COURSE_ID;
const PRODUCT_ID = process.env.PRODUCT_ID;
const ORDER_ID = process.env.ORDER_ID;
const POLL_MS = 3000;
const MAX_WAIT_MS = 60_000;

if (!EMAIL || !PASSWORD) {
  console.error('Set TEST_EMAIL and TEST_PASSWORD env vars.');
  process.exit(1);
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} → ${res.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

async function resolveCourseId(token: string): Promise<string> {
  if (COURSE_ID) return COURSE_ID;

  const courses = await request<{ success: boolean; data: Array<{ id: string; title: string; price: number }> }>(
    '/api/public/courses',
  );

  const paid = courses.data?.find((c) => Number(c.price) > 0);
  const course = paid ?? courses.data?.[0];
  if (!course) throw new Error('No courses found — create a course in admin first');

  console.log(`  Using course: ${course.title} (₹${course.price})`);
  return course.id;
}

async function resolveRemidiesOrderId(token: string): Promise<string> {
  if (ORDER_ID) {
    console.log(`  Using existing order: ${ORDER_ID}`);
    return ORDER_ID;
  }

  let productId = PRODUCT_ID;
  if (!productId) {
    const products = await request<{
      success: boolean;
      data: Array<{ id: string; name: string; price: number; stock: number }>;
    }>('/api/remidies/user/products?limit=20');

    const inStock = products.data?.find((p) => Number(p.stock) > 0 && Number(p.price) > 0);
    const product = inStock ?? products.data?.[0];
    if (!product) throw new Error('No remedies products found — add products in admin first');

    productId = product.id;
    console.log(`  Using product: ${product.name} (₹${product.price}, stock: ${product.stock})`);
  }

  await request('/api/remidies/user/cart', {
    method: 'POST',
    token,
    body: JSON.stringify({ productId, quantity: 1 }),
  });
  console.log('  Added product to cart');

  const checkout = await request<{
    success: boolean;
    data: { order: { id: string; totalAmount: number } };
  }>('/api/remidies/user/checkout', {
    method: 'POST',
    token,
    body: JSON.stringify({
      shippingName: 'Test User',
      shippingPhone: '9876543210',
      shippingAddress: '123 Test Street',
      shippingCity: 'Mumbai',
      shippingState: 'Maharashtra',
      shippingPostal: '400001',
    }),
  });

  const orderId = checkout.data.order.id;
  console.log(`  Order created: ${orderId} (₹${checkout.data.order.totalAmount})`);
  return orderId;
}

async function createPayment(
  token: string,
  type: 'course' | 'remidies',
): Promise<{ transactionId: string; upiUrl: string }> {
  if (type === 'course') {
    const courseId = await resolveCourseId(token);
    return request('/api/payments/course/order', {
      method: 'POST',
      token,
      body: JSON.stringify({ courseId }),
    });
  }

  const orderId = await resolveRemidiesOrderId(token);
  return request('/api/payments/remidies/order', {
    method: 'POST',
    token,
    body: JSON.stringify({ orderId }),
  });
}

async function pollPaymentStatus(token: string, transactionId: string): Promise<void> {
  const started = Date.now();
  let lastStatus = '';

  while (Date.now() - started < MAX_WAIT_MS) {
    const status = await request<{ status: string; utr?: string; amount?: number }>(
      `/api/payments/status/${transactionId}`,
      { token },
    );

    if (status.status !== lastStatus) {
      lastStatus = status.status;
      console.log(`  → ${status.status}${status.utr ? ` (UTR: ${status.utr})` : ''}`);
    }

    if (status.status === 'COMPLETED' || status.status === 'PAID') {
      console.log('\n✅ Payment completed successfully!\n');
      return;
    }

    if (status.status === 'FAILED') {
      console.error('\n❌ Payment failed.\n');
      process.exit(1);
    }

    await Bun.sleep(POLL_MS);
  }

  console.error('\n❌ Timed out. Ensure worker is running: bun run worker\n');
  process.exit(1);
}

async function main() {
  console.log(`\n🔌 API: ${BASE_URL}`);
  console.log(`📦 Payment type: ${PAYMENT_TYPE}`);

  const health = await request<{ status: string; redis: boolean }>('/health');
  console.log(`✓ Health: ${health.status} (redis: ${health.redis})`);
  if (!health.redis) {
    console.warn('⚠ Redis is down — start it: docker compose up -d redis');
  }

  const login = await request<{
    success: boolean;
    data: { token: string; user: { id: string; email: string } };
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!login.success) throw new Error('Login failed');
  const token = login.data.token;
  console.log(`✓ Logged in as ${login.data.user.email}`);

  const paymentType = PAYMENT_TYPE === 'course' ? 'course' : 'remidies';
  const created = await createPayment(token, paymentType);

  const { transactionId, upiUrl } = created;
  console.log(`✓ Payment created: ${transactionId}`);
  console.log(`  UPI URL: ${upiUrl.slice(0, 80)}...`);
  console.log(`\n⏳ Mock bank auto-completes after ~15s. Polling status...\n`);

  await pollPaymentStatus(token, transactionId);
}

main().catch((err) => {
  console.error('\n❌', err.message);
  process.exit(1);
});
