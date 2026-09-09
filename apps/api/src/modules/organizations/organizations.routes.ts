import { Router } from "express";
import { organizationsController } from "./organizations.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.js";

export const organizationsRouter = Router();

// Only RESELLER_SUPER_ADMIN can manage organizations
organizationsRouter.use(requireAuth, requireRole("RESELLER_SUPER_ADMIN"));

organizationsRouter.get("/", organizationsController.list);
organizationsRouter.post("/", organizationsController.create);
organizationsRouter.put("/:id", organizationsController.update);
organizationsRouter.delete("/:id", organizationsController.delete);
