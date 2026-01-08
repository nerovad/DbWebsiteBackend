// src/routes/companyRoutes.ts
import express, { Request, Response, NextFunction } from "express";
import { authenticateToken, AuthRequest } from "../middleware/authMiddleware";
import { getMyCompanies } from "../controllers/profileController";

const router = express.Router();

// GET /api/companies/mine
router.get("/mine", authenticateToken, (req: AuthRequest, res: Response, next: NextFunction): void => {
  getMyCompanies(req, res).catch(next);
});

export default router;
