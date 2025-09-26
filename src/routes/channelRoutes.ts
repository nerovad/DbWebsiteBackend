// src/routes/channelRoutes.ts
import express, { Request, Response, NextFunction } from "express";
import {
  createChannel,
  listChannels,
  getChannel,
} from "../controllers/channelController";
import { listFilmsForChannel } from "../controllers/filmController";
import { getMyChannels } from "../controllers/profileController";
import { authenticateToken, AuthRequest } from "../middleware/authMiddleware";

const router = express.Router();

// GET /api/channels/mine - MUST be before /:slug to avoid conflicts
router.get("/mine", authenticateToken, (req: AuthRequest, res: Response, next: NextFunction): void => {
  getMyChannels(req, res).catch(next);
});

// POST /api/channels
router.post("/", (req: Request, res: Response, next: NextFunction) => {
  createChannel(req, res, next);
});

// GET /api/channels (list all channels)
router.get("/", (req: Request, res: Response, next: NextFunction) => {
  listChannels(req, res, next);
});

// GET /api/channels/:channelId/films (numeric IDs only)
router.get("/:channelId(\\d+)/films", (req: Request, res: Response, next: NextFunction) => {
  listFilmsForChannel(req, res, next);
});

// GET /api/channels/:slug (get single channel by slug)
router.get("/:slug", (req: Request, res: Response, next: NextFunction) => {
  getChannel(req, res, next);
});

export default router;
