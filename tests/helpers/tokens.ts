import { signToken } from "../../src/core/jwt";

export function studentToken(userId = "test-student-id"): string {
  return signToken({ userId, role: "student" });
}

export function adminToken(userId = "test-admin-id"): string {
  return signToken({ userId, role: "admin" });
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
