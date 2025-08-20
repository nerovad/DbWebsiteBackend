import express, { Request, Response, NextFunction } from "express";
import { createChannel, listChannels, getChannel } from "../controllers/channelController";

const router = express.Router();

// POST /api/channels
router.post("/", (req: Request, res: Response, next: NextFunction) => {
  createChannel(req, res, next);
});

// GET /api/channels
router.get("/", (req: Request, res: Response, next: NextFunction) => {
  listChannels(req, res, next);
});

// GET /api/channels/:slug
router.get("/:slug", (req: Request, res: Response, next: NextFunction) => {
  getChannel(req, res, next);
});

export default router;
