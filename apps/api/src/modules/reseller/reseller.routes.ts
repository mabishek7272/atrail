import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import { requireGod, requireResellerOrAbove } from "../../middlewares/rbac.js";
import { resellerService } from "./reseller.service.js";
import { featureFlagsService } from "../feature-flags/feature-flags.service.js";

export const resellerRouter = Router();

// ── GOD-only endpoints ────────────────────────────────────────────────────────

// List all resellers
resellerRouter.get("/", requireAuth, requireGod(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resellers = await resellerService.listResellers();
    res.json({ ok: true, resellers });
  } catch (e) { next(e); }
});

// Create a new reseller + owner account
resellerRouter.post("/", requireAuth, requireGod(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const u = (req as any).user;
    const result = await resellerService.createReseller(req.body, u.id);
    res.status(201).json({ ok: true, ...result });
  } catch (e) { next(e); }
});

// Get single reseller detail
resellerRouter.get("/:resellerId", requireAuth, requireResellerOrAbove(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const u = (req as any).user;
    // RESELLER_SUPER_ADMIN can only see their own reseller
    if (u.role === "RESELLER_SUPER_ADMIN") {
      const own = await resellerService.getResellerByOwner(u.id);
      if (!own || own.id !== req.params.resellerId) {
        return res.status(403).json({ ok: false, message: "Access denied" });
      }
    }
    const reseller = await resellerService.getReseller(req.params.resellerId);
    res.json({ ok: true, reseller });
  } catch (e) { next(e); }
});

// Create a client org under a reseller
resellerRouter.post("/:resellerId/orgs", requireAuth, requireResellerOrAbove(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const u = (req as any).user;
    // RESELLER_SUPER_ADMIN must own the reseller
    if (u.role === "RESELLER_SUPER_ADMIN") {
      const own = await resellerService.getResellerByOwner(u.id);
      if (!own || own.id !== req.params.resellerId) {
        return res.status(403).json({ ok: false, message: "You can only create orgs under your own reseller" });
      }
    }
    const result = await resellerService.createClientOrg(
      { ...req.body, resellerId: req.params.resellerId },
      u.id,
      u.role,
    );
    res.status(201).json({ ok: true, ...result });
  } catch (e) { next(e); }
});

// Update reseller name (GOD only)
resellerRouter.patch("/:resellerId", requireAuth, requireGod(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reseller = await resellerService.updateReseller(req.params.resellerId, req.body);
    res.json({ ok: true, reseller });
  } catch (e) { next(e); }
});

// ── Feature flags management (GOD or RESELLER_SUPER_ADMIN for their orgs) ─────

resellerRouter.get("/orgs/:orgId/features", requireAuth, requireResellerOrAbove(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const flags = await featureFlagsService.getFlags(req.params.orgId);
    res.json({ ok: true, flags });
  } catch (e) { next(e); }
});

resellerRouter.patch("/orgs/:orgId/features", requireAuth, requireResellerOrAbove(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const flags = await featureFlagsService.updateFlags(req.params.orgId, req.body);
    res.json({ ok: true, flags });
  } catch (e) { next(e); }
});
