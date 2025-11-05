import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import pool from "../../db/pool";
import { slugify } from "../utils/slugify";
import crypto from "crypto";

/* ------------ Auth helper copied to match your profileController style ------------ */
function authUserIdOr401(req: Request, res: Response): number | null {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Access Denied" });
    return null;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: number };
    return decoded.id;
  } catch {
    res.status(401).json({ error: "Invalid Token" });
    return null;
  }
}

/* --------------------------------- Utils --------------------------------- */
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
 * - Associates the channel with the logged-in user (owner_id).
 * - Updates are allowed only if the current user owns the channel.
 */
export async function createChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  const uid = authUserIdOr401(req, res);
  if (!uid) return;

  const client = await pool.connect();
  let begun = false;

  try {
    let {
      name,
      slug,
      stream_url,
      display_name,
      channel_number,
      // OPTIONAL festival payload
      type,   // "channel" | "festival" (unused for channel insert; accepted for completeness)
      event,  // { kind, title, starts_at, ends_at, voting_mode, require_login }
      films,  // [{ title, creator?, duration?, thumbnail? }]
    } = req.body as {
      name: string;
      slug?: string;
      stream_url?: string;
      display_name?: string;
      channel_number?: number;
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

    await client.query("BEGIN");
    begun = true;

    // Check if slug already exists
    const existing = await client.query(
      `select id, owner_id, name, stream_url, stream_key, ingest_app, playback_path, created_at
         from channels
        where slug = $1
        limit 1`,
      [slug]
    );

    let channel: any;

    if (existing.rowCount) {
      const row = existing.rows[0];

      // Only owner can update this channel
      if (row.owner_id !== uid) {
        await client.query("ROLLBACK");
        begun = false;
        res.status(409).json({ error: "Channel slug is already in use by another user." });
        return;
      }

      // Update name/stream_url only; preserve keys/paths
      const upd = await client.query(
        `update channels
            set name = $2,
                stream_url = $3,
                display_name = $4,
                channel_number = $5
          where id = $1
        returning id, slug, name, stream_url, stream_key, ingest_app, playback_path, display_name, channel_number, created_at`,
        [row.id, name ?? row.name, stream_url ?? row.stream_url, display_name ?? row.display_name, channel_number ?? row.channel_number]
      );
      channel = upd.rows[0];

    } else {
      // Create a brand-new channel for this owner
      const streamKey = generateStreamKey();
      const ingestApp = "live";
      const playbackPath = `/hls/${streamKey}/index.m3u8`;

      const chResult = await client.query(
        `insert into channels (owner_id, slug, name, stream_url, stream_key, ingest_app, playback_path, display_name, channel_number, created_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
        returning id, slug, name, stream_url, stream_key, ingest_app, playback_path, display_name, channel_number, created_at`,
        [uid, slug, name ?? slug, stream_url ?? null, streamKey, ingestApp, playbackPath, display_name ?? null, channel_number ?? null]
      );
      channel = chResult.rows[0];
    }

    // Optional event + films for session lineup
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
      const sesResult = await client.query(
        `insert into sessions (channel_id, title, starts_at, ends_at, status, created_at)
         values ($1, $2, $3, $4, 'scheduled', now())
         returning id, channel_id, title, starts_at, ends_at, status`,
        [channel.id, event!.title, event!.starts_at, event!.ends_at ?? null]
      );
      sessionRow = sesResult.rows[0];

      filmRows = [];
      for (let i = 0; i < films!.length; i++) {
        const f = films![i];
        if (!f?.title || !f.title.trim()) continue;

        const runtimeSeconds = parseDurationToSeconds(f.duration);

        const found = await client.query(
          `select id, title from films where lower(title) = lower($1) limit 1`,
          [f.title.trim()]
        );

        let filmId: number;
        if (found.rowCount) {
          filmId = found.rows[0].id;
        } else {
          const ins = await client.query(
            `insert into films (title, creator_user_id, runtime_seconds, created_at)
             values ($1, $2, $3, now())
             returning id, title`,
            [f.title.trim(), uid, runtimeSeconds]
          );
          filmId = ins.rows[0].id;
        }

        filmRows.push({ id: filmId, title: f.title.trim() });

        await client.query(
          `insert into session_entries (session_id, film_id, order_index)
           values ($1, $2, $3)`,
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
    try { if (begun) await pool.query("ROLLBACK"); } catch { }
    next(err);
  } finally {
    client.release();
  }
}

/* ===== Existing endpoints (kept) ===== */

// GET /api/channels  -> must return an ARRAY
export async function listChannels(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rows } = await pool.query(
      `select id, slug, name, stream_url, stream_key, ingest_app, playback_path, created_at
         from channels
        order by created_at desc`
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
      `select id, slug, name, stream_url, stream_key, ingest_app, playback_path, created_at
         from channels
        where slug = $1
        limit 1`,
      [slug]
    );

    if (!rows.length) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const channel = rows[0];

    const session = await pool.query(
      `select id, title, starts_at, ends_at, status
         from sessions
        where channel_id = $1
        order by starts_at desc
        limit 1`,
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

export async function updateChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  const uid = authUserIdOr401(req, res);
  if (!uid) return;

  const channelId = req.params.id;
  const { display_name, description, event, films } = req.body;

  const client = await pool.connect();
  let begun = false;

  try {
    await client.query("BEGIN");
    begun = true;

    // Verify ownership
    const ownership = await client.query(
      `SELECT id FROM channels WHERE id = $1 AND owner_id = $2`,
      [channelId, uid]
    );

    if (!ownership.rowCount) {
      await client.query("ROLLBACK");
      begun = false;
      res.status(403).json({ error: "Not authorized to edit this channel" });
      return;
    }

    // Update channel
    const updated = await client.query(
      `UPDATE channels 
       SET display_name = $1, description = $2
       WHERE id = $3
       RETURNING *`,
      [display_name, description, channelId]
    );

    // Handle event creation if provided (same logic as createChannel)
    let sessionRow = null;
    let filmRows: Array<{ id: number; title: string }> = [];

    if (event && films && films.length > 0) {
      const sesResult = await client.query(
        `INSERT INTO sessions (channel_id, title, starts_at, ends_at, status, created_at)
     VALUES ($1, $2, $3, $4, 'scheduled', now())
     RETURNING id, channel_id, title, starts_at, ends_at, status`,
        [channelId, event.title, event.starts_at, event.ends_at ?? null]
      );
      sessionRow = sesResult.rows[0];

      for (let i = 0; i < films.length; i++) {
        const f = films[i];
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
         VALUES ($1, $2, $3, now())
         RETURNING id, title`,
            [f.title.trim(), uid, runtimeSeconds]
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

    res.json({
      ...updated.rows[0],
      session: sessionRow,
    });
  } catch (err) {
    try { if (begun) await client.query("ROLLBACK"); } catch { }
    next(err);
  } finally {
    client.release();
  }
}

// Add this to channelController.ts

export async function deleteChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  const uid = authUserIdOr401(req, res);
  if (!uid) return;

  const channelId = req.params.id;

  const client = await pool.connect();
  let begun = false;

  try {
    await client.query("BEGIN");
    begun = true;

    // Verify ownership
    const ownership = await client.query(
      `SELECT id FROM channels WHERE id = $1 AND owner_id = $2`,
      [channelId, uid]
    );

    if (!ownership.rowCount) {
      await client.query("ROLLBACK");
      begun = false;
      res.status(403).json({ error: "Not authorized to delete this channel" });
      return;
    }

    // Delete associated sessions and entries first (if any)
    await client.query(
      `DELETE FROM session_entries 
       WHERE session_id IN (
         SELECT id FROM sessions WHERE channel_id = $1
       )`,
      [channelId]
    );

    await client.query(
      `DELETE FROM sessions WHERE channel_id = $1`,
      [channelId]
    );

    // Delete the channel
    await client.query(
      `DELETE FROM channels WHERE id = $1`,
      [channelId]
    );

    await client.query("COMMIT");
    begun = false;

    res.json({ success: true, message: "Channel deleted successfully" });
  } catch (err) {
    try { if (begun) await client.query("ROLLBACK"); } catch { }
    next(err);
  } finally {
    client.release();
  }
}

// GET /api/channels/:slug/ingest
export async function getIngest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slug = String(req.params.slug);
    const { rows } = await pool.query(
      `select slug, stream_key, ingest_app
         from channels
        where slug = $1
        limit 1`,
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

// POST /api/channels/:slug/rotate
export async function rotateKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slug = String(req.params.slug);
    const newKey = generateStreamKey();
    const newPlayback = `/hls/${newKey}/index.m3u8`;

    const { rows } = await pool.query(
      `update channels
          set stream_key = $1,
              playback_path = $2
        where slug = $3
      returning stream_key, playback_path`,
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

/* ===== NEW: GET /api/channels/mine ===== */
export async function getMyChannels(req: Request, res: Response): Promise<void> {
  const uid = authUserIdOr401(req, res);
  if (!uid) return;

  const r = await pool.query(
    `select
      id, slug, name, display_name, channel_number,
      stream_url,
      null::text as description,
      false as "isLive",
      null::text as thumbnail
    from channels
    where owner_id = $1
    order by created_at desc`,
    [uid]
  );

  res.json(r.rows);
}
