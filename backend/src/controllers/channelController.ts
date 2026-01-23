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
 * - Auto-determines voting_mode based on event.kind
 * - Always requires login to vote (require_login = true)
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
      type, // "channel" | "festival" (unused for channel insert; accepted for completeness)
      event, // { kind, title, starts_at, ends_at, tournament_bracket }
      films, // [{ title, creator?, duration?, thumbnail?, id? }]
      // NEW: Widget system fields
      widgets, // [{ type, order, config? }]
      about_text, // Markdown text for About widget
      first_live_at, // When channel first went live
    } = req.body as {
      name: string;
      slug?: string;
      stream_url?: string;
      display_name?: string;
      channel_number?: number;
      type?: string;
      event?: {
        kind?: string; // "film_festival" | "battle_royal" | "tournament"
        title: string;
        starts_at: string;
        ends_at?: string | null;
        tournament_bracket?: any; // tournament bracket structure
      };
      films?: Array<{
        title: string;
        creator?: string;
        duration?: string;
        thumbnail?: string;
        id?: string; // film ID for tournament seeding
      }>;
      widgets?: Array<{
        type: string;
        order: number;
        config?: any;
      }>;
      about_text?: string;
      first_live_at?: string | null;
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
       from channels where slug = $1 limit 1`,
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
         set name = $2, stream_url = $3, display_name = $4, channel_number = $5,
             widgets = COALESCE($6, widgets),
             about_text = COALESCE($7, about_text),
             first_live_at = COALESCE($8, first_live_at)
         where id = $1
         returning id, slug, name, stream_url, stream_key, ingest_app, playback_path, display_name, channel_number, widgets, about_text, first_live_at, created_at`,
        [row.id, name ?? row.name, stream_url ?? row.stream_url, display_name ?? row.display_name, channel_number ?? row.channel_number,
         widgets ? JSON.stringify(widgets) : null,
         about_text ?? null,
         first_live_at ?? null]
      );
      channel = upd.rows[0];
    } else {
      // Create a brand-new channel for this owner
      const streamKey = generateStreamKey();
      const ingestApp = "live";
      const playbackPath = `/hls/${streamKey}/index.m3u8`;

      const chResult = await client.query(
        `insert into channels
           (owner_id, slug, name, stream_url, stream_key, ingest_app, playback_path, display_name, channel_number, widgets, about_text, first_live_at, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
         returning id, slug, name, stream_url, stream_key, ingest_app, playback_path, display_name, channel_number, widgets, about_text, first_live_at, created_at`,
        [uid, slug, name ?? slug, stream_url ?? null, streamKey, ingestApp, playbackPath, display_name ?? null, channel_number ?? null,
         widgets ? JSON.stringify(widgets) : null,
         about_text ?? null,
         first_live_at ?? null]
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
      // ✅ Auto-determine voting_mode based on event type
      const eventKind = event!.kind ?? 'film_festival';
      let votingMode: 'ratings' | 'battle';

      if (eventKind === 'film_festival') {
        votingMode = 'ratings';
      } else if (eventKind === 'battle_royal' || eventKind === 'tournament') {
        votingMode = 'battle';
      } else {
        votingMode = 'ratings'; // default fallback
      }

      // ✅ Always require login to vote
      const requireLogin = true;

      const sesResult = await client.query(
        `insert into sessions (channel_id, title, starts_at, ends_at, status, event_type, voting_mode, require_login, created_at)
         values ($1, $2, $3, $4, 'scheduled', $5, $6, $7, now())
         returning id, channel_id, title, starts_at, ends_at, status, event_type, voting_mode, require_login`,
        [channel.id, event!.title, event!.starts_at, event!.ends_at ?? null, eventKind, votingMode, requireLogin]
      );
      sessionRow = sesResult.rows[0];

      // ✅ Process films and create session entries
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

      // ✅ TOURNAMENT BRACKET HANDLING
      if (event?.kind === "tournament" && event?.tournament_bracket) {
        console.log("Creating tournament bracket for session:", sessionRow.id);
        console.log("Available films in filmRows:", filmRows.map(f => ({ id: f.id, title: f.title })));

        // Store bracket structure in session
        await client.query(
          `UPDATE sessions SET tournament_bracket = $1 WHERE id = $2`,
          [JSON.stringify(event.tournament_bracket), sessionRow.id]
        );

        // Create initial matchup records for Round 1 only
        const bracket = event.tournament_bracket;
        if (bracket.rounds && Array.isArray(bracket.rounds)) {
          const firstRound = bracket.rounds.find((r: any) => r.roundNumber === 1);
          if (firstRound && firstRound.matchups) {
            for (const matchup of firstRound.matchups) {
              console.log("Processing matchup:", {
                id: matchup.id,
                film1: matchup.film1,
                film2: matchup.film2
              });

              // Get actual film database IDs by matching titles
              let film1DbId: number | null = null;
              let film2DbId: number | null = null;

              // ✅ Check for film1 existence (not film1.id)
              if (matchup.film1) {
                console.log(`Looking for film1: "${matchup.film1.title}"`);
                const film1Match = filmRows.find(fr => {
                  const match = matchup.film1.title.toLowerCase().trim() === fr.title.toLowerCase().trim();
                  console.log(`  Comparing "${matchup.film1.title}" vs "${fr.title}" = ${match}`);
                  return match;
                });
                film1DbId = film1Match?.id ?? null;
                console.log(`  film1DbId: ${film1DbId}`);
              }

              // ✅ Check for film2 existence (not film2.id)
              if (matchup.film2) {
                console.log(`Looking for film2: "${matchup.film2.title}"`);
                const film2Match = filmRows.find(fr => {
                  const match = matchup.film2.title.toLowerCase().trim() === fr.title.toLowerCase().trim();
                  console.log(`  Comparing "${matchup.film2.title}" vs "${fr.title}" = ${match}`);
                  return match;
                });
                film2DbId = film2Match?.id ?? null;
                console.log(`  film2DbId: ${film2DbId}`);
              }
              // Store film IDs as strings (matching your schema)
              await client.query(
                `INSERT INTO tournament_matchups (session_id, matchup_id, round_number, position, film1_id, film2_id)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                  sessionRow.id,
                  matchup.id,
                  firstRound.roundNumber,
                  matchup.position,
                  film1DbId ? film1DbId.toString() : null,
                  film2DbId ? film2DbId.toString() : null,
                ]
              );
            }
            console.log(`Created ${firstRound.matchups.length} tournament matchups`);
          }
        }
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
    try {
      if (begun) await client.query("ROLLBACK");
    } catch { }
    next(err);
  } finally {
    client.release();
  }
}

/* ===== Existing endpoints (kept) ===== */

// GET /api/channels -> must return an ARRAY
export async function listChannels(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rows } = await pool.query(
      `select id, slug, name, stream_url, stream_key, ingest_app, playback_path, channel_number, created_at
       from channels order by created_at desc`
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
      `select c.id, c.slug, c.name, c.stream_url, c.stream_key, c.ingest_app, c.playback_path,
              c.display_name, c.channel_number, c.widgets, c.about_text, c.first_live_at, c.created_at,
              u.username as owner_name
       from channels c
       left join users u on c.owner_id = u.id
       where c.slug = $1 limit 1`,
      [slug]
    );
    if (!rows.length) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const channel = rows[0];

    // ✅ UPDATED: Add event_type to the session query
    const session = await pool.query(
      `select id, title, starts_at, ends_at, status, event_type
       from sessions where channel_id = $1
       order by starts_at desc limit 1`,
      [channel.id]
    );

    const latestSession = session.rows[0] ?? null;

    res.json({
      ...channel,
      latestSession: latestSession,
      event_type: latestSession?.event_type ?? null, // ✅ Add event_type at top level for easy frontend access
    });
  } catch (err) {
    next(err);
  }
}

export async function updateChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  const uid = authUserIdOr401(req, res);
  if (!uid) return;

  const channelId = req.params.id;
  const { display_name, description, event, films, widgets, about_text, first_live_at } = req.body;

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
       SET display_name = COALESCE($1, display_name),
           description = COALESCE($2, description),
           widgets = COALESCE($3, widgets),
           about_text = COALESCE($4, about_text),
           first_live_at = COALESCE($5, first_live_at)
       WHERE id = $6
       RETURNING *`,
      [display_name, description, widgets ? JSON.stringify(widgets) : null, about_text, first_live_at, channelId]
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
    try {
      if (begun) await client.query("ROLLBACK");
    } catch { }
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
      `DELETE FROM session_entries WHERE session_id IN (
         SELECT id FROM sessions WHERE channel_id = $1
       )`,
      [channelId]
    );

    await client.query(`DELETE FROM sessions WHERE channel_id = $1`, [channelId]);

    // Delete the channel
    await client.query(`DELETE FROM channels WHERE id = $1`, [channelId]);

    await client.query("COMMIT");
    begun = false;

    res.json({ success: true, message: "Channel deleted successfully" });
  } catch (err) {
    try {
      if (begun) await client.query("ROLLBACK");
    } catch { }
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
      `select slug, stream_key, ingest_app from channels where slug = $1 limit 1`,
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
       set stream_key = $1, playback_path = $2
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
    `SELECT
       c.id,
       c.slug,
       c.name,
       c.display_name,
       c.channel_number,
       c.stream_url,
       null::text as description,
       false as "isLive",
       null::text as thumbnail,
       s.id as session_id,
       s.event_type
     FROM channels c
     LEFT JOIN sessions s ON s.channel_id = c.id AND s.is_active = true
     WHERE c.owner_id = $1
     ORDER BY c.created_at DESC`,
    [uid]
  );

  res.json(r.rows);
}

/* ===== NEW: Channel Schedule Endpoints ===== */

// GET /api/channels/:slug/schedule - Get channel schedule
export async function getChannelSchedule(req: Request, res: Response): Promise<void> {
  const { slug } = req.params;
  const client = await pool.connect();

  try {
    // Get channel ID
    const chResult = await client.query('SELECT id FROM channels WHERE slug = $1', [slug]);
    if (chResult.rows.length === 0) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const channelId = chResult.rows[0].id;

    const now = new Date();

    // Get now playing (currently airing or most recent scheduled)
    const nowResult = await client.query(
      `SELECT cs.*, f.title as film_title, f.id as film_id
       FROM channel_schedule cs
       LEFT JOIN films f ON cs.film_id = f.id
       WHERE cs.channel_id = $1
         AND cs.scheduled_at <= $2
       ORDER BY cs.scheduled_at DESC
       LIMIT 1`,
      [channelId, now]
    );

    // Get up next (future scheduled items)
    const upNextResult = await client.query(
      `SELECT cs.*, f.title as film_title, f.id as film_id
       FROM channel_schedule cs
       LEFT JOIN films f ON cs.film_id = f.id
       WHERE cs.channel_id = $1
         AND cs.scheduled_at > $2
       ORDER BY cs.scheduled_at ASC
       LIMIT 5`,
      [channelId, now]
    );

    res.json({
      now_playing: nowResult.rows[0] || null,
      up_next: upNextResult.rows,
      schedule: [...nowResult.rows, ...upNextResult.rows]
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  } finally {
    client.release();
  }
}

// POST /api/channels/:slug/schedule - Create/update schedule items
export async function updateChannelSchedule(req: Request, res: Response): Promise<void> {
  const { slug } = req.params;
  const uid = authUserIdOr401(req, res);
  if (uid === null) return;

  const { schedule } = req.body; // Array of {film_id, title, scheduled_at, duration_seconds}

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get channel and verify ownership
    const chResult = await client.query(
      'SELECT id, owner_id FROM channels WHERE slug = $1',
      [slug]
    );
    if (chResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const channel = chResult.rows[0];
    if (channel.owner_id !== uid) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    // Insert schedule items (upsert on conflict)
    for (const item of schedule) {
      await client.query(
        `INSERT INTO channel_schedule
           (channel_id, film_id, title, scheduled_at, duration_seconds, status)
         VALUES ($1, $2, $3, $4, $5, 'scheduled')
         ON CONFLICT (channel_id, scheduled_at)
         DO UPDATE SET
           film_id = EXCLUDED.film_id,
           title = EXCLUDED.title,
           duration_seconds = EXCLUDED.duration_seconds`,
        [channel.id, item.film_id || null, item.title || null, item.scheduled_at, item.duration_seconds || null]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  } finally {
    client.release();
  }
}
