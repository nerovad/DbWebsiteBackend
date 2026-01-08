import express, { Request, Response, NextFunction } from "express";
import {
  createSession,
  startSession,
  closeSession,
  addEntry,
  getLineup,
} from "../controllers/festivalController";

const router = express.Router();

// POST /api/festivals  (create a session)
router.post("/", (req: Request, res: Response, next: NextFunction) => {
  createSession(req, res, next);
});

// POST /api/festivals/:sessionId/start
router.post("/:sessionId/start", (req: Request, res: Response, next: NextFunction) => {
  startSession(req, res, next);
});

// POST /api/festivals/:sessionId/close
router.post("/:sessionId/close", (req: Request, res: Response, next: NextFunction) => {
  closeSession(req, res, next);
});

// POST /api/festivals/:sessionId/entries  (add film to lineup)
router.post("/:sessionId/entries", (req: Request, res: Response, next: NextFunction) => {
  addEntry(req, res, next);
});

// GET /api/festivals/:sessionId/lineup
router.get("/:sessionId/lineup", (req: Request, res: Response, next: NextFunction) => {
  getLineup(req, res, next);
});

export default router;
