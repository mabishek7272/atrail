import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import { validateBody } from "../../utils/validate.js";
import { upload } from "../../utils/upload.js";
import {
  createTaskSchema,
  reviewSubmissionSchema,
  setMyTaskStatusSchema,
  submitTaskSchema,
} from "./tasks.schemas.js";
import { tasksController } from "./tasks.controller.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

// Lists
tasksRouter.get("/all", tasksController.allTasks);
tasksRouter.get("/my", tasksController.myTasks);
tasksRouter.get("/project/:projectId", tasksController.projectTasks);
tasksRouter.get("/:taskId", tasksController.getTask);

// Create task (ADMIN/RESELLER_SUPER_ADMIN or PROJECT HEAD)
tasksRouter.post(
  "/",
  validateBody(createTaskSchema),
  tasksController.createTask
);

// Assigned user: update own task status
tasksRouter.patch(
  "/:taskId/my-status",
  validateBody(setMyTaskStatusSchema),
  tasksController.setMyStatus
);

// Admin: force-update any task's status (for Kanban drag-drop)
tasksRouter.patch(
  "/:taskId/status",
  requireRole("ADMIN", "RESELLER_SUPER_ADMIN", "ELITE", "GOD", "DEVELOPER"),
  async (req, res, next) => {
    try {
      const { status } = req.body;
      if (!status) return res.status(400).json({ ok: false, message: "status required" });
      const { prisma } = await import("../../db.js");
      const task = await prisma.task.update({
        where: { id: req.params.taskId },
        data: { status },
        include: {
          assignedTo: { select: { id: true, fullName: true } },
          project:    { select: { id: true, name: true } },
        },
      });
      res.json({ ok: true, task });
    } catch (e) { next(e); }
  }
);

// Submit with proofs (multipart)
tasksRouter.post(
  "/:taskId/submit",
  upload.array("files", 6),
  validateBody(submitTaskSchema),
  tasksController.submitTask
);

// Review submission (ACCEPT/REJECT)
tasksRouter.post(
  "/submissions/:submissionId/review",
  validateBody(reviewSubmissionSchema),
  tasksController.reviewSubmission
);

// Delete task (ADMIN+)
tasksRouter.delete("/:taskId", tasksController.deleteTask);
