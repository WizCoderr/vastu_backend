import { Router } from "express";
import { requireAuth, requireAdmin } from "../core/authMiddleware";
import {
  remidiesCatalogRouter,
  remidiesAuthUserRouter,
  remidiesAdminRouter,
} from "../remidies/remidies.routes";

const router = Router();

// =============================================================================
// USER ROUTES  →  /api/remidies/user/*
// Catalog is public; cart/checkout require authentication
// =============================================================================
router.use("/user", remidiesCatalogRouter);
router.use("/user", requireAuth, remidiesAuthUserRouter);

// =============================================================================
// ADMIN ROUTES  →  /api/remidies/admin/*
// Requires admin role
// =============================================================================
router.use("/admin", requireAdmin, remidiesAdminRouter);

export default router;
