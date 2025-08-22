import { Request, Response, NextFunction } from "express";
import pool from "../../db/pool";
import { slugify } from "../utils/slugify";
import crypto from "crypto";

function generateStreamKey(): string {
  return crypto.randomBytes(16).toString("hex");
}

// Create or update a channel
export async function createChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let { name, slug, stream_url } = req.body as {
      name: string;
      slug?: string;
      stream_url?: string;
    };

    if (!name && !slug) {
      res.status(400).json({ error: "name (or slug) is required" });
      return;
    }

    slug = slug ? slugify(slug) : slugify(name);
    const streamKey = generateStreamKey();
    const ingestApp = "live";
    const playbackPath = `/hls/${streamKey}/index.m3u8`;

    const result = await pool.query(
      `INSERT INTO channels (slug, name, stream_url, stream_key, ingest_app, playback_path)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (slug)
      DO UPDATE SET name = EXCLUDED.name, stream_url = EXCLUDED.stream_url,
                    stream_key = channels.stream_key,        -- don't wipe existing key
                    ingest_app = channels.ingest_app,        -- keep existing app
                    playback_path = channels.playback_path   -- keep existing path
      RETURNING id, slug, name, stream_url, stream_key, ingest_app, playback_path, created_at`,
      [slug, name ?? slug, stream_url ?? null, streamKey, ingestApp, playbackPath]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// List all channels
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

// Get single channel (and latest session)
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

    if (rows.length === 0) {
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

// Get OBS ingest URL and stream key
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

    if (rows.length === 0) {
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

// rotateKey
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

    if (rows.length === 0) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    res.json({ stream_key: rows[0].stream_key, playback_path: rows[0].playback_path });
  } catch (err) {
    next(err);
  }
}
