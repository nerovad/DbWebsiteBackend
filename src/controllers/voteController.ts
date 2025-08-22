import { Request, Response } from "express";
import pool from "../../db/pool";


export const rateEntry = async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const entryId = Number(req.params.entryId);
    const { score } = req.body;


    const userId = (req as any).user?.id || 1; // replace with real auth later


    const ballot = await pool.query(
      `INSERT INTO ballots (session_id, user_id, weight)
VALUES ($1, $2, 1.0)
ON CONFLICT (session_id, user_id) DO UPDATE SET user_id = EXCLUDED.user_id
RETURNING id`,
      [sessionId, userId]
    );


    await pool.query(
      `INSERT INTO ratings (session_id, entry_id, ballot_id, score)
VALUES ($1, $2, $3, $4)
ON CONFLICT (session_id, entry_id, ballot_id)
DO UPDATE SET score = EXCLUDED.score, created_at = now()`,
      [sessionId, entryId, ballot.rows[0].id, score]
    );


    res.json({ ok: true });
  } catch (err) {
    console.error("Error rating:", err);
    res.status(500).json({ error: "Error saving rating" });
  }
};


export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.sessionId);


    const { rows } = await pool.query(
      `SELECT
se.id AS entry_id,
f.title,
ROUND(SUM(r.score * COALESCE(b.weight,1)) / NULLIF(SUM(COALESCE(b.weight,1)),0), 3) AS weighted_avg,
COUNT(*) AS votes
FROM ratings r
JOIN ballots b ON (b.session_id = r.session_id AND b.id = r.ballot_id)
JOIN session_entries se ON se.id = r.entry_id
JOIN films f ON f.id = se.film_id
WHERE r.session_id = $1
GROUP BY se.id, f.title
ORDER BY weighted_avg DESC, votes DESC`,
      [sessionId]
    );


    res.json(rows);
  } catch (err) {
    console.error("Error leaderboard:", err);
    res.status(500).json({ error: "Error fetching leaderboard" });
  }
};
