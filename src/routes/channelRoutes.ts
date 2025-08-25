import express, { Request, Response, NextFunction } from "express";
import { createChannel, listChannels, getChannel } from "../controllers/channelController";
import { listFilmsForChannel } from "../controllers/filmController";

const router = express.Router();

// POST /api/channels
router.post("/", (req: Request, res: Response, next: NextFunction) => {
  createChannel(req, res, next);
});

// GET /api/channels   (must return an ARRAY)
router.get("/", (req: Request, res: Response, next: NextFunction) => {
  listChannels(req, res, next);
});

// ✅ NEW: GET /api/channels/:channelId/films
// IMPORTANT: this MUST be before "/:slug" so it doesn't get swallowed by that route
router.get("/:channelId/films", (req: Request, res: Response, next: NextFunction) => {
  listFilmsForChannel(req, res, next);
});

// GET /api/channels/:slug
router.get("/:slug", (req: Request, res: Response, next: NextFunction) => {
  getChannel(req, res, next);
});

export default router;
