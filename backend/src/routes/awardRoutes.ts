// src/routes/awardRoutes.ts
import express, { Request, Response, NextFunction } from "express";
import { authenticateToken, AuthRequest } from "../middleware/authMiddleware";
import { getMyAwards } from "../controllers/profileController";

const router = express.Router();

// GET /api/awards/mine
router.get("/mine", authenticateToken, (req: AuthRequest, res: Response, next: NextFunction): void => {
  getMyAwards(req, res).catch(next);
});

export default router;
