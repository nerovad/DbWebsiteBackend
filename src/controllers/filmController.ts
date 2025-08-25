import { Request, Response, NextFunction } from "express";
import pool from "../../db/pool";

/* ===== Existing endpoints (unchanged) ===== */

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

/* ===== NEW: Films for the current channel's session (SINGLE definition) ===== */

/** Resolve a channel id by slug, name, or stream_key */
async function findChannelId(key: string): Promise<number | null> {
  const { rows } = await pool.query(
    `SELECT id
       FROM channels
      WHERE slug = $1
         OR name = $1
         OR stream_key = $1
      LIMIT 1`,
    [key]
  );
  return rows.length ? rows[0].id : null;
}

/**
 * GET /api/channels/:channelId/films
 * Returns the lineup (films) for the channel's active session,
 * or the most recent session if no active one exists.
 */
export async function listFilmsForChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const channelKey = String(req.params.channelId);
    const cid = await findChannelId(channelKey);
    if (!cid) { res.json([]); return; }

    const nowIso = new Date().toISOString();

    // Prefer "active now"; fallback to most recent
    const active = await client.query(
      `SELECT id
         FROM sessions
        WHERE channel_id = $1
          AND starts_at <= $2
          AND (ends_at IS NULL OR ends_at >= $2)
        ORDER BY starts_at DESC
        LIMIT 1`,
      [cid, nowIso]
    );

    let sessionId: number | null = active.rowCount ? active.rows[0].id : null;
    if (!sessionId) {
      const latest = await client.query(
        `SELECT id
           FROM sessions
          WHERE channel_id = $1
          ORDER BY starts_at DESC
          LIMIT 1`,
        [cid]
      );
      sessionId = latest.rowCount ? latest.rows[0].id : null;
    }
    if (!sessionId) { res.json([]); return; }

    // Join lineup
    const rows = await client.query(
      `SELECT f.id, f.title, f.runtime_seconds, se.order_index
         FROM session_entries se
         JOIN films f ON f.id = se.film_id
        WHERE se.session_id = $1
        ORDER BY se.order_index ASC, f.id ASC`,
      [sessionId]
    );

    const data = rows.rows.map((r: any) => {
      let duration: string | undefined;
      if (typeof r.runtime_seconds === "number" && r.runtime_seconds >= 0) {
        const mm = Math.floor(r.runtime_seconds / 60);
        const ss = r.runtime_seconds % 60;
        duration = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
      }
      return { id: String(r.id), title: r.title, duration };
    });

    res.json(data); // must be an array
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
}
