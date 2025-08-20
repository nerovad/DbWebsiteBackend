import { Request, Response, NextFunction } from "express";
import pool from "../db/pool";
import { slugify } from "../utils/slugify";

export async function createChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let { name, slug, stream_url } = req.body as { name: string; slug?: string; stream_url?: string };
    if (!name && !slug) {
      res.status(400).json({ error: "name (or slug) is required" });
      return;
    }
    slug = slug ? slugify(slug) : slugify(name);

    const result = await pool.query(
      `INSERT INTO channels (slug, name, stream_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, stream_url = EXCLUDED.stream_url
       RETURNING id, slug, name, stream_url, created_at`,
      [slug, name ?? slug, stream_url ?? null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function listChannels(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, slug, name, stream_url, created_at FROM channels ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function getChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slug = String(req.params.slug);
    const { rows } = await pool.query(
      `SELECT id, slug, name, stream_url, created_at FROM channels WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    // Optionally include the most recent scheduled/live session
    const channelId = rows[0].id;
    const s = await pool.query(
      `SELECT id, title, starts_at, ends_at, status
         FROM sessions
        WHERE channel_id = $1
        ORDER BY starts_at DESC
        LIMIT 1`,
      [channelId]
    );

    res.json({ ...rows[0], latestSession: s.rows[0] ?? null });
  } catch (err) {
    next(err);
  }
}
