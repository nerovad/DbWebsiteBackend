import { Router, RequestHandler } from "express";
import { verifyStreamKey } from "../controllers/rtmpController";

// Small wrapper so TS is happy with async controllers
const wrap =
  (fn: (...args: any[]) => Promise<void>): RequestHandler =>
    (req, res, next) => {
      fn(req, res).catch(next);
    };

const router = Router();

// POST /api/rtmp/auth  (nginx-rtmp on_publish hook)
router.post("/auth", wrap(verifyStreamKey));

export default router;
