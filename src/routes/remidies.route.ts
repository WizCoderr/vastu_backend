import { Router } from "express";
import { requireAuth, requireAdmin } from "../core/authMiddleware";
import {
  remidiesUserRouter,
  remidiesAdminRouter,
} from "../remidies/remidies.routes";

const router = Router();

// =============================================================================
// USER ROUTES  →  /api/remidies/user/*
// Requires authenticated user (student/instructor)
// =============================================================================
router.use("/user", requireAuth, remidiesUserRouter);

// =============================================================================
// ADMIN ROUTES  →  /api/remidies/admin/*
// Requires admin role
// =============================================================================
router.use("/admin", requireAdmin, remidiesAdminRouter);

export default router;
