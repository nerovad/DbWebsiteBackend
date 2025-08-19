import express, { Request, Response, NextFunction } from "express";
import { getProfile } from "../controllers/profileController";

const router = express.Router();

// GET /api/profile
router.get("/", (req: Request, res: Response, next: NextFunction): void => {
  // delegate to controller; controller handles sending the response
  // and returns Promise<void>. We deliberately don't return anything here.
  getProfile(req, res).catch(next);
});

export default router;
