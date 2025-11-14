// tournamentController.ts
import { Request, Response } from "express";
import pool from "../../db/pool";
import { AuthRequest } from "../middleware/authMiddleware";

/**
 * GET /api/channels/:channelId/tournament
 * Fetches tournament bracket data with current vote counts
 * UPDATED: Now includes voting_window information
 */
export async function getTournament(req: Request, res: Response): Promise<void> {
  try {
    const { channelId } = req.params;

    // Get channel with active session and tournament bracket
    const channelResult = await pool.query(
      `SELECT 
        c.id as channel_id,
        c.name as channel_name,
        c.slug,
        s.id as session_id, 
        s.tournament_bracket, 
        s.starts_at, 
        s.ends_at,
        s.event_type,
        s.voting_window
       FROM channels c
       LEFT JOIN sessions s ON s.channel_id = c.id AND s.is_active = true
       WHERE c.id::text = $1 OR c.slug = $1`,
      [channelId]
    );

    if (channelResult.rows.length === 0) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const channel = channelResult.rows[0];

    if (!channel.tournament_bracket) {
      res.status(404).json({ error: "No tournament found for this channel" });
      return;
    }

    if (channel.event_type !== "tournament") {
      res.status(400).json({ error: "This channel is not a tournament" });
      return;
    }

    // Parse the bracket structure
    const bracket = channel.tournament_bracket;

    // Get all matchup data from database with current vote counts
    const matchupsResult = await pool.query(
      `SELECT 
        tm.*,
        COUNT(DISTINCT tv.id) as total_votes
       FROM tournament_matchups tm
       LEFT JOIN tournament_votes tv ON tv.matchup_id = tm.id
       WHERE tm.session_id = $1 
       GROUP BY tm.id
       ORDER BY tm.round_number, tm.position`,
      [channel.session_id]
    );

    // Determine tournament status
    const now = new Date();
    const startsAt = new Date(channel.starts_at);
    const endsAt = new Date(channel.ends_at);

    let status: "upcoming" | "active" | "completed";
    if (now < startsAt) {
      status = "upcoming";
    } else if (now > endsAt) {
      status = "completed";
    } else {
      status = "active";
    }

    // Find current round (first round with incomplete matchups during active period)
    let currentRound = 1;
    if (status === "active") {
      for (const matchup of matchupsResult.rows) {
        if (!matchup.winner_id) {
          currentRound = matchup.round_number;
          break;
        }
      }
    } else if (status === "completed") {
      currentRound = bracket.rounds.length;
    }

    // Merge database matchup data with bracket structure
    const updatedRounds = bracket.rounds.map((round: any) => ({
      roundNumber: round.roundNumber,
      roundName: getRoundName(round.roundNumber, bracket.rounds.length),
      matchups: round.matchups.map((matchup: any) => {
        // Find corresponding database record
        const dbMatchup = matchupsResult.rows.find(
          (m) => m.matchup_id === matchup.id
        );

        return {
          id: matchup.id,
          position: matchup.position,
          roundNumber: round.roundNumber,
          film1: matchup.film1,
          film2: matchup.film2,
          votes1: dbMatchup?.film1_votes || 0,
          votes2: dbMatchup?.film2_votes || 0,
          winner: dbMatchup?.winner_id || undefined,
          dbMatchupId: dbMatchup?.id, // Include DB ID for voting endpoint
        };
      }),
    }));

    // Include voting window in response
    const votingWindow = channel.voting_window || { isActive: false, currentRound: null };

    res.json({
      id: channel.session_id,
      channelName: channel.channel_name,
      status,
      currentRound,
      rounds: updatedRounds,
      startsAt: channel.starts_at,
      endsAt: channel.ends_at,
      votingWindow, // NEW: Include voting window status
    });
  } catch (error) {
    console.error("Error fetching tournament:", error);
    res.status(500).json({ error: "Failed to fetch tournament data" });
  }
}

/**
 * POST /api/tournaments/matchups/:matchupId/vote
 * Records a vote for a film in a matchup
 * UPDATED: Now checks voting_window before allowing votes
 */
export async function voteOnMatchup(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { matchupId } = req.params;
    const { filmId } = req.body;
    const userId = req.userId; // ✅ Use req.userId from auth middleware

    if (!filmId) {
      res.status(400).json({ error: "Film ID is required" });
      return;
    }

    // Get matchup details including voting_window from session
    const matchupResult = await pool.query(
      `SELECT tm.*, s.require_login, s.voting_window
       FROM tournament_matchups tm
       JOIN sessions s ON s.id = tm.session_id
       WHERE tm.id = $1`,
      [matchupId]
    );

    if (matchupResult.rows.length === 0) {
      res.status(404).json({ error: "Matchup not found" });
      return;
    }

    const matchup = matchupResult.rows[0];

    // NEW: Check if voting window is active
    const votingWindow = matchup.voting_window || { isActive: false, currentRound: null };

    if (!votingWindow.isActive) {
      res.status(400).json({ error: "Voting is not currently active" });
      return;
    }

    // NEW: Check if voting is for the correct round
    if (votingWindow.currentRound !== matchup.round_number) {
      res.status(400).json({
        error: `Voting is active for Round ${votingWindow.currentRound}, not Round ${matchup.round_number}`
      });
      return;
    }

    // Verify film is in this matchup
    if (filmId !== matchup.film1_id && filmId !== matchup.film2_id) {
      res.status(400).json({ error: "Invalid film for this matchup" });
      return;
    }

    // Check if matchup is already completed
    if (matchup.winner_id) {
      res.status(400).json({ error: "This matchup has already been decided" });
      return;
    }

    // Check authentication if required
    if (matchup.require_login && !userId) {
      res.status(401).json({ error: "Login required to vote" });
      return;
    }

    // Check if user already voted (if logged in)
    if (userId) {
      const existingVote = await pool.query(
        `SELECT id FROM tournament_votes 
         WHERE matchup_id = $1 AND user_id = $2`,
        [matchupId, userId]
      );

      if (existingVote.rows.length > 0) {
        res.status(400).json({ error: "You have already voted on this matchup" });
        return;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (userId) {
        await client.query(
          `INSERT INTO tournament_votes (matchup_id, user_id, film_id)
           VALUES ($1, $2, $3)`,
          [matchupId, userId, filmId]
        );
      }

      const voteColumn = filmId === matchup.film1_id ? 'film1_votes' : 'film2_votes';
      await client.query(
        `UPDATE tournament_matchups 
         SET ${voteColumn} = ${voteColumn} + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [matchupId]
      );

      await client.query('COMMIT');

      const updatedMatchup = await pool.query(
        `SELECT * FROM tournament_matchups WHERE id = $1`,
        [matchupId]
      );

      res.json({
        success: true,
        message: "Vote recorded successfully",
        matchup: {
          id: updatedMatchup.rows[0].id,
          film1Votes: updatedMatchup.rows[0].film1_votes,
          film2Votes: updatedMatchup.rows[0].film2_votes,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error recording vote:", error);
    res.status(500).json({ error: "Failed to record vote" });
  }
}

/**
 * POST /api/tournaments/matchups/:matchupId/advance
 * Advances the winner of a matchup to the next round
 */
export async function advanceWinner(req: Request, res: Response): Promise<void> {
  try {
    const { matchupId } = req.params;
    const { forceWinnerId } = req.body;

    const matchupResult = await pool.query(
      `SELECT tm.*, s.tournament_bracket
       FROM tournament_matchups tm
       JOIN sessions s ON s.id = tm.session_id
       WHERE tm.id = $1`,
      [matchupId]
    );

    if (matchupResult.rows.length === 0) {
      res.status(404).json({ error: "Matchup not found" });
      return;
    }

    const matchup = matchupResult.rows[0];

    let winnerId: string;
    if (forceWinnerId) {
      if (forceWinnerId !== matchup.film1_id && forceWinnerId !== matchup.film2_id) {
        res.status(400).json({ error: "Invalid winner ID" });
        return;
      }
      winnerId = forceWinnerId;
    } else {
      if (matchup.film1_votes === matchup.film2_votes) {
        res.status(400).json({ error: "Cannot advance: votes are tied" });
        return;
      }
      winnerId = matchup.film1_votes > matchup.film2_votes
        ? matchup.film1_id
        : matchup.film2_id;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE tournament_matchups 
         SET winner_id = $1, 
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [winnerId, matchupId]
      );

      const bracket = JSON.parse(matchup.tournament_bracket);
      const totalRounds = bracket.rounds.length;

      if (matchup.round_number === totalRounds) {
        await client.query('COMMIT');
        res.json({
          success: true,
          message: "Tournament completed!",
          champion: winnerId,
        });
        return;
      }

      const nextRound = matchup.round_number + 1;
      const nextPosition = Math.floor(matchup.position / 2);
      const nextMatchupId = `r${nextRound}-m${nextPosition + 1}`;

      const nextMatchupResult = await client.query(
        `SELECT id FROM tournament_matchups 
         WHERE session_id = $1 AND round_number = $2 AND position = $3`,
        [matchup.session_id, nextRound, nextPosition]
      );

      const isFilm1Slot = matchup.position % 2 === 0;
      const filmSlot = isFilm1Slot ? 'film1_id' : 'film2_id';

      if (nextMatchupResult.rows.length === 0) {
        await client.query(
          `INSERT INTO tournament_matchups 
           (session_id, matchup_id, round_number, position, ${filmSlot})
           VALUES ($1, $2, $3, $4, $5)`,
          [matchup.session_id, nextMatchupId, nextRound, nextPosition, winnerId]
        );
      } else {
        await client.query(
          `UPDATE tournament_matchups 
           SET ${filmSlot} = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [winnerId, nextMatchupResult.rows[0].id]
        );
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: "Winner advanced to next round",
        winnerId,
        nextRound,
        nextPosition,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error advancing winner:", error);
    res.status(500).json({ error: "Failed to advance winner" });
  }
}

/**
 * POST /api/tournaments/rounds/:sessionId/:roundNumber/advance-all
 */
export async function advanceAllInRound(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, roundNumber } = req.params;

    const matchupsResult = await pool.query(
      `SELECT * FROM tournament_matchups 
       WHERE session_id = $1 AND round_number = $2
       ORDER BY position`,
      [sessionId, parseInt(roundNumber)]
    );

    if (matchupsResult.rows.length === 0) {
      res.status(404).json({ error: "No matchups found for this round" });
      return;
    }

    const results = [];

    for (const matchup of matchupsResult.rows) {
      try {
        if (matchup.winner_id) {
          results.push({ matchupId: matchup.id, status: "already_advanced" });
          continue;
        }

        if (matchup.film1_votes === matchup.film2_votes) {
          results.push({ matchupId: matchup.id, status: "tie" });
          continue;
        }

        const winnerId = matchup.film1_votes > matchup.film2_votes
          ? matchup.film1_id
          : matchup.film2_id;

        await pool.query(
          `UPDATE tournament_matchups 
           SET winner_id = $1, completed_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [winnerId, matchup.id]
        );

        const nextRound = matchup.round_number + 1;
        const nextPosition = Math.floor(matchup.position / 2);
        const isFilm1Slot = matchup.position % 2 === 0;
        const filmSlot = isFilm1Slot ? 'film1_id' : 'film2_id';
        const nextMatchupId = `r${nextRound}-m${nextPosition + 1}`;

        const existing = await pool.query(
          `SELECT id FROM tournament_matchups 
           WHERE session_id = $1 AND round_number = $2 AND position = $3`,
          [sessionId, nextRound, nextPosition]
        );

        if (existing.rows.length === 0) {
          await pool.query(
            `INSERT INTO tournament_matchups 
             (session_id, matchup_id, round_number, position, ${filmSlot})
             VALUES ($1, $2, $3, $4, $5)`,
            [sessionId, nextMatchupId, nextRound, nextPosition, winnerId]
          );
        } else {
          await pool.query(
            `UPDATE tournament_matchups 
             SET ${filmSlot} = $1
             WHERE id = $2`,
            [winnerId, existing.rows[0].id]
          );
        }

        results.push({ matchupId: matchup.id, status: "advanced", winnerId });
      } catch (error: any) {
        results.push({ matchupId: matchup.id, status: "error", error: error.message });
      }
    }

    res.json({
      success: true,
      message: "Round advancement complete",
      results,
    });
  } catch (error) {
    console.error("Error advancing round:", error);
    res.status(500).json({ error: "Failed to advance round" });
  }
}

function getRoundName(roundNumber: number, totalRounds: number): string {
  const roundsFromEnd = totalRounds - roundNumber;
  if (roundsFromEnd === 0) return "Finals";
  if (roundsFromEnd === 1) return "Semi-Finals";
  if (roundsFromEnd === 2) return "Quarter-Finals";
  if (roundsFromEnd === 3) return "Round of 16";
  return `Round ${roundNumber}`;
}
