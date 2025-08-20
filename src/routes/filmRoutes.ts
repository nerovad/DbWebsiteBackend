import express, { Request, Response, NextFunction } from "express";
import { createFilm, listFilms } from "../controllers/filmController";

const router = express.Router();

// POST /api/films
router.post("/", (req: Request, res: Response, next: NextFunction) => {
  createFilm(req, res, next);
});

// GET /api/films
router.get("/", (req: Request, res: Response, next: NextFunction) => {
  listFilms(req, res, next);
});

export default router;
