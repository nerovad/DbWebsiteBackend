import { Request, Response, NextFunction } from "express";
import pool from "../../db/pool";
import { slugify } from "../utils/slugify";
import crypto from "crypto";

function generateStreamKey(): string {
  return crypto.randomBytes(16).toString("hex");
}

function parseDurationToSeconds(s?: string): number | null {
  if (!s) return null;
  const parts = s.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    return hh * 3600 + mm * 60 + ss;
  } else if (parts.length === 2) {
    const [mm, ss] = parts;
    return mm * 60 + ss;
  } else if (parts.length === 1) {
    return parts[0];
  }
  return null;
}

/**
 * Create or update a channel, and (optionally) create a session + lineup.
 * - If body has ONLY { name, slug?, stream_url? } => behaves exactly as before.
 * - If body ALSO has { event, films[] } => creates a session and links films.
 */
export async function createChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  let begun = false;
  try {
    let {
      name,
      slug,
      stream_url,
      // OPTIONAL festival payload
      type,   // "channel" | "festival" (unused for channel insert; accepted for completeness)
      event,  // { kind, title, starts_at, ends_at, voting_mode, require_login }
      films,  // [{ title, creator?, duration?, thumbnail? }]
    } = req.body as {
      name: string;
      slug?: string;
      stream_url?: string;
      type?: string;
      event?: {
        kind?: string;
        title: string;
        starts_at: string;
        ends_at?: string | null;
        voting_mode?: "ratings" | "battle";
        require_login?: boolean;
      };
      films?: Array<{ title: string; creator?: string; duration?: string; thumbnail?: string }>;
    };

    if (!name && !slug) {
      res.status(400).json({ error: "name (or slug) is required" });
      return;
    }

    slug = slug ? slugify(slug) : slugify(name!);
    const streamKey = generateStreamKey();
    const ingestApp = "live";
    const playbackPath = `/hls/${streamKey}/index.m3u8`;

    await client.query("BEGIN");
    begun = true;

    // 1) Upsert channel (unchanged semantics)
    const chResult = await client.query(
      `INSERT INTO channels (slug, name, stream_url, stream_key, ingest_app, playback_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug)
       DO UPDATE SET
          name = EXCLUDED.name,
          stream_url = EXCLUDED.stream_url,
          stream_key = channels.stream_key,      -- keep existing
          ingest_app = channels.ingest_app,      -- keep existing
          playback_path = channels.playback_path -- keep existing
       RETURNING id, slug, name, stream_url, stream_key, ingest_app, playback_path, created_at`,
      [slug, name ?? slug, stream_url ?? null, streamKey, ingestApp, playbackPath]
    );

    const channel = chResult.rows[0];

    // 2) Optionally create session + films + session_entries
    const hasEventPayload =
      event &&
      typeof event.title === "string" &&
      event.title.trim().length > 0 &&
      typeof event.starts_at === "string" &&
      event.starts_at.trim().length > 0;

    const hasFilms = Array.isArray(films) && films.length > 0;

    let sessionRow: any = null;
    let filmRows: Array<{ id: number; title: string }> = [];

    if (hasEventPayload && hasFilms) {
      // Insert a session (festival window)
      const sesResult = await client.query(
        `INSERT INTO sessions (channel_id, title, starts_at, ends_at, status, created_at)
         VALUES ($1, $2, $3, $4, 'scheduled', NOW())
         RETURNING id, channel_id, title, starts_at, ends_at, status`,
        [channel.id, event!.title, event!.starts_at, event!.ends_at ?? null]
      );
      sessionRow = sesResult.rows[0];

      // For each film: find by title (case-insensitive) or insert new; then create lineup row.
      filmRows = [];
      for (let i = 0; i < films!.length; i++) {
        const f = films![i];
        if (!f?.title || !f.title.trim()) continue;

        const runtimeSeconds = parseDurationToSeconds(f.duration);

        const found = await client.query(
          `SELECT id, title FROM films WHERE lower(title) = lower($1) LIMIT 1`,
          [f.title.trim()]
        );

        let filmId: number;
        if (found.rowCount) {
          filmId = found.rows[0].id;
        } else {
          const ins = await client.query(
            `INSERT INTO films (title, creator_user_id, runtime_seconds, created_at)
             VALUES ($1, NULL, $2, NOW())
             RETURNING id, title`,
            [f.title.trim(), runtimeSeconds]
          );
          filmId = ins.rows[0].id;
        }

        filmRows.push({ id: filmId, title: f.title.trim() });

        await client.query(
          `INSERT INTO session_entries (session_id, film_id, order_index)
           VALUES ($1, $2, $3)`,
          [sessionRow.id, filmId, i]
        );
      }
    }

    await client.query("COMMIT");
    begun = false;

    res.status(201).json({
      ...channel,
      session: sessionRow ?? null,
      films: filmRows,
    });
  } catch (err) {
    try { if (begun) await client.query("ROLLBACK"); } catch { }
    next(err);
  } finally {
    client.release();
  }
}

/* ===== Keep these named exports so routes compile and frontend works ===== */

// GET /api/channels  -> must return an ARRAY
export async function listChannels(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, slug, name, stream_url, stream_key, ingest_app, playback_path, created_at
         FROM channels
        ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// GET /api/channels/:slug
export async function getChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slug = String(req.params.slug);
    const { rows } = await pool.query(
      `SELECT id, slug, name, stream_url, stream_key, ingest_app, playback_path, created_at
         FROM channels
        WHERE slug = $1
        LIMIT 1`,
      [slug]
    );

    if (!rows.length) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const channel = rows[0];

    const session = await pool.query(
      `SELECT id, title, starts_at, ends_at, status
         FROM sessions
        WHERE channel_id = $1
        ORDER BY starts_at DESC
        LIMIT 1`,
      [channel.id]
    );

    res.json({
      ...channel,
      latestSession: session.rows[0] ?? null,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/channels/:slug/ingest
export async function getIngest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slug = String(req.params.slug);
    const { rows } = await pool.query(
      `SELECT slug, stream_key, ingest_app
         FROM channels
        WHERE slug = $1
        LIMIT 1`,
      [slug]
    );

    if (!rows.length) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const { stream_key, ingest_app } = rows[0];
    const ingest_url = `rtmp://dainbramage.tv/${ingest_app}/${stream_key}`;
    res.json({ ingest_url, stream_key });
  } catch (err) {
    next(err);
  }
}

// POST /api/channels/:slug/rotate (if you have this in routes)
export async function rotateKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slug = String(req.params.slug);
    const newKey = generateStreamKey();
    const newPlayback = `/hls/${newKey}/index.m3u8`;

    const { rows } = await pool.query(
      `UPDATE channels
          SET stream_key = $1,
              playback_path = $2
        WHERE slug = $3
        RETURNING stream_key, playback_path`,
      [newKey, newPlayback, slug]
    );

    if (!rows.length) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    res.json({ stream_key: rows[0].stream_key, playback_path: rows[0].playback_path });
  } catch (err) {
    next(err);
  }
}
