import { Request, Response, NextFunction } from "express";
import pool from "../../db/pool";

export async function createFilm(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title } = req.body as { title: string };
    if (!title?.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO films (title)
       VALUES ($1)
       ON CONFLICT (title) DO UPDATE SET title = EXCLUDED.title
       RETURNING id, title`,
      [title.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function listFilms(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rows } = await pool.query(`SELECT id, title FROM films ORDER BY id DESC LIMIT 500`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}
