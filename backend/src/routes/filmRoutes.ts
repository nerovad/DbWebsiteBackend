import express, { Request, Response, NextFunction } from "express";
import { createFilm, listFilms } from "../controllers/filmController";
import { authenticateToken, AuthRequest } from "../middleware/authMiddleware";
import { getMyFilms } from "../controllers/profileController";

const router = express.Router();

router.get("/mine", authenticateToken, (req: AuthRequest, res: Response, next: NextFunction): void => {
  getMyFilms(req, res).catch(next);
});

// POST /api/films
router.post("/", (req: Request, res: Response, next: NextFunction) => {
  createFilm(req, res, next);
});

// GET /api/films
router.get("/", (req: Request, res: Response, next: NextFunction) => {
  listFilms(req, res, next);
});

export default router;
