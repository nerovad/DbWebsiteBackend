// src/routes/profileRoutes.ts
import express, { Request, Response, NextFunction } from "express";
import {
  getProfile,
  updateBio,
  getMyChannels,
  getMyFilms,
  getMyAwards,
  getMyCompanies
} from "../controllers/profileController";
import { authenticateToken, AuthRequest } from "../middleware/authMiddleware";

const router = express.Router();

// All profile routes require authentication
router.use(authenticateToken);

// GET /api/profile/me - Get current user's profile
router.get("/me", (req: AuthRequest, res: Response, next: NextFunction): void => {
  getProfile(req, res).catch(next);
});

// POST /api/profile/bio - Update bio
router.post("/bio", (req: AuthRequest, res: Response, next: NextFunction): void => {
  updateBio(req, res).catch(next);
});

export default router;
