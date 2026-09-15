export type RouteSpec = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  /** Sample path params substituted before request */
  samplePath?: string;
};

/** Endpoints that must respond without authentication */
export const publicRoutes: RouteSpec[] = [
  { method: "GET", path: "/" },
  { method: "GET", path: "/health" },
  { method: "GET", path: "/api/payments/" },
  { method: "GET", path: "/api/public/courses" },
  { method: "GET", path: "/api/public/google-reviews" },
  { method: "GET", path: "/api/public/remidies/categories" },
  { method: "GET", path: "/api/public/remidies/products" },
  { method: "GET", path: "/api/payments/course/plan/:courseId", samplePath: "/api/payments/course/plan/test-course" },
  { method: "GET", path: "/api/payments/plan/:courseId", samplePath: "/api/payments/plan/test-course" },
];

/** Endpoints that must reject unauthenticated requests with 401 */
export const authRequiredRoutes: RouteSpec[] = [
  { method: "GET", path: "/auth/me" },
  { method: "GET", path: "/auth/profile" },
  { method: "GET", path: "/api/student/courses" },
  { method: "GET", path: "/api/student/enrolled-courses" },
  { method: "GET", path: "/api/wallet/passes" },
  { method: "GET", path: "/api/payments/history" },
  { method: "GET", path: "/api/payments/payu/status/:txnid", samplePath: "/api/payments/payu/status/test-txn" },
  { method: "POST", path: "/api/payments/course/order" },
  { method: "POST", path: "/api/student/remidies/cart" },
  { method: "GET", path: "/api/student/remidies/cart" },
];

/** Endpoints that must reject student tokens with 403 */
export const adminRequiredRoutes: RouteSpec[] = [
  { method: "GET", path: "/api/admin/students" },
  { method: "GET", path: "/api/instructor/courses" },
  { method: "GET", path: "/api/payments/admin/all" },
  { method: "GET", path: "/api/payments/admin/transactions" },
  { method: "GET", path: "/api/admin/remidies/categories" },
  { method: "GET", path: "/api/admin/whatsapp/status" },
  { method: "GET", path: "/api/admin/telegram/status" },
  { method: "GET", path: "/api/admin/wallet/passes" },
  { method: "POST", path: "/api/admin/enroll" },
];
