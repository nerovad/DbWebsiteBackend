import { Request, Response } from 'express';
import pool from '../../db/pool';

interface VotingWindow {
  isActive: boolean;
  currentRound: number | null;
}

interface MatchupData {
  id: string;
  matchup_id: string;
  round_number: number;
  position: number;
  film1_id: string | null;
  film2_id: string | null;
  film1_votes: number;
  film2_votes: number;
  winner_id: string | null;
  completed_at: Date | null;
  film1_title: string;
  film2_title: string;
}

interface RoundMatchup {
  id: string;
  matchupId: string;
  round: number;
  position: number;
  film1Title: string;
  film2Title: string;
  votes1: number;
  votes2: number;
  winnerId: string | null;
  completed: boolean;
}

// Get tournament status (for Tournament Console)
export const getTournamentStatus = async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const userId = (req as any).user?.id;

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    // Get session and check if it's a tournament
    const sessionQuery = await pool.query(
      `SELECT s.*, c.owner_id 
       FROM sessions s 
       JOIN channels c ON s.channel_id = c.id 
       WHERE s.id = $1 AND s.event_type = 'Tournament'`,
      [sessionId]
    );

    if (sessionQuery.rows.length === 0) {
      res.status(404).json({ error: 'Tournament session not found' });
      return;
    }

    const session = sessionQuery.rows[0];

    // Verify ownership
    if (session.owner_id !== userId) {
      res.status(403).json({ error: 'You do not own this tournament' });
      return;
    }

    // Get all matchups grouped by round
    const matchupsQuery = await pool.query(
      `SELECT 
        tm.*,
        f1.title as film1_title,
        f2.title as film2_title
       FROM tournament_matchups tm
       LEFT JOIN films f1 ON tm.film1_id = f1.id
       LEFT JOIN films f2 ON tm.film2_id = f2.id
       WHERE tm.session_id = $1
       ORDER BY tm.round_number, tm.position`,
      [sessionId]
    );

    const matchups = matchupsQuery.rows;

    // Group matchups by round
    const rounds: Record<number, RoundMatchup[]> = {};
    let maxRound = 0;
    let currentRound = 1;

    matchups.forEach(matchup => {
      if (!rounds[matchup.round_number]) {
        rounds[matchup.round_number] = [];
      }
      rounds[matchup.round_number].push({
        id: matchup.id,
        matchupId: matchup.matchup_id,
        round: matchup.round_number,
        position: matchup.position,
        film1Title: matchup.film1_title,
        film2Title: matchup.film2_title,
        votes1: matchup.film1_votes || 0,
        votes2: matchup.film2_votes || 0,
        winnerId: matchup.winner_id,
        completed: matchup.completed_at !== null
      });

      maxRound = Math.max(maxRound, matchup.round_number);

      // Find current round (first incomplete round)
      if (!matchup.winner_id && matchup.round_number >= currentRound) {
        currentRound = matchup.round_number;
      }
    });

    // Check if tournament is complete
    const isComplete = matchups.every(m => m.winner_id !== null);

    // Get voting window status
    const votingWindow: VotingWindow = session.voting_window || { isActive: false, currentRound: null };

    res.json({
      currentRound,
      totalRounds: maxRound,
      isComplete,
      votingWindow,
      rounds
    });
  } catch (error) {
    console.error('Error getting tournament status:', error);
    res.status(500).json({ error: 'Failed to get tournament status' });
  }
};

// Start voting for a round
export const startVoting = async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const { round } = req.body;
  const userId = (req as any).user?.id;

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!round || typeof round !== 'number') {
    res.status(400).json({ error: 'Round number is required' });
    return;
  }

  try {
    // Get session and verify ownership
    const sessionQuery = await pool.query(
      `SELECT s.*, c.owner_id 
       FROM sessions s 
       JOIN channels c ON s.channel_id = c.id 
       WHERE s.id = $1 AND s.event_type = 'Tournament'`,
      [sessionId]
    );

    if (sessionQuery.rows.length === 0) {
      res.status(404).json({ error: 'Tournament session not found' });
      return;
    }

    const session = sessionQuery.rows[0];

    if (session.owner_id !== userId) {
      res.status(403).json({ error: 'You do not own this tournament' });
      return;
    }

    // Check if voting is already active
    const votingWindow: VotingWindow = session.voting_window || { isActive: false, currentRound: null };
    if (votingWindow.isActive) {
      res.status(400).json({
        error: `Voting is already active for Round ${votingWindow.currentRound}`
      });
      return;
    }

    // Verify that the round exists and has incomplete matchups
    const roundMatchups = await pool.query(
      `SELECT COUNT(*) as total, COUNT(winner_id) as completed
       FROM tournament_matchups
       WHERE session_id = $1 AND round_number = $2`,
      [sessionId, round]
    );

    const roundData = roundMatchups.rows[0];
    if (parseInt(roundData.total) === 0) {
      res.status(400).json({ error: `Round ${round} does not exist` });
      return;
    }

    if (parseInt(roundData.completed) === parseInt(roundData.total)) {
      res.status(400).json({ error: `Round ${round} is already complete` });
      return;
    }

    // Start voting window
    const newVotingWindow: VotingWindow = { isActive: true, currentRound: round };
    await pool.query(
      `UPDATE sessions 
       SET voting_window = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(newVotingWindow), sessionId]
    );

    res.json({
      message: `Voting started for Round ${round}`,
      votingWindow: newVotingWindow
    });
  } catch (error) {
    console.error('Error starting voting:', error);
    res.status(500).json({ error: 'Failed to start voting' });
  }
};

// End voting and advance winners
export const endVoting = async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const userId = (req as any).user?.id;

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    // Get session and verify ownership
    const sessionQuery = await pool.query(
      `SELECT s.*, c.owner_id 
       FROM sessions s 
       JOIN channels c ON s.channel_id = c.id 
       WHERE s.id = $1 AND s.event_type = 'Tournament'`,
      [sessionId]
    );

    if (sessionQuery.rows.length === 0) {
      res.status(404).json({ error: 'Tournament session not found' });
      return;
    }

    const session = sessionQuery.rows[0];

    if (session.owner_id !== userId) {
      res.status(403).json({ error: 'You do not own this tournament' });
      return;
    }

    // Check if voting is active
    const votingWindow: VotingWindow = session.voting_window || { isActive: false, currentRound: null };
    if (!votingWindow.isActive) {
      res.status(400).json({ error: 'No active voting window' });
      return;
    }

    const currentRound = votingWindow.currentRound!;

    // Get all matchups in current round
    const matchupsQuery = await pool.query(
      `SELECT * FROM tournament_matchups
       WHERE session_id = $1 AND round_number = $2 AND winner_id IS NULL`,
      [sessionId, currentRound]
    );

    let winnersAdvanced = 0;

    // Determine winners and advance them
    for (const matchup of matchupsQuery.rows) {
      let winnerId: string | null = null;

      // Determine winner (film with most votes)
      if (matchup.film1_votes > matchup.film2_votes) {
        winnerId = matchup.film1_id;
      } else if (matchup.film2_votes > matchup.film1_votes) {
        winnerId = matchup.film2_id;
      } else if (matchup.film1_votes === matchup.film2_votes) {
        // In case of tie, randomly pick (or you could use seed)
        winnerId = Math.random() < 0.5 ? matchup.film1_id : matchup.film2_id;
      }

      if (winnerId) {
        // Update matchup with winner
        await pool.query(
          `UPDATE tournament_matchups
           SET winner_id = $1, completed_at = NOW()
           WHERE id = $2`,
          [winnerId, matchup.id]
        );

        winnersAdvanced++;

        // Advance winner to next round if not finals
        const nextRound = currentRound + 1;
        const nextPosition = Math.floor(matchup.position / 2);

        // Check if next round matchup exists
        const nextMatchupQuery = await pool.query(
          `SELECT * FROM tournament_matchups
           WHERE session_id = $1 AND round_number = $2 AND position = $3`,
          [sessionId, nextRound, nextPosition]
        );

        if (nextMatchupQuery.rows.length > 0) {
          const nextMatchup = nextMatchupQuery.rows[0];

          // Determine if winner goes to film1 or film2 slot
          const filmSlot = matchup.position % 2 === 0 ? 'film1_id' : 'film2_id';

          await pool.query(
            `UPDATE tournament_matchups
             SET ${filmSlot} = $1
             WHERE id = $2`,
            [winnerId, nextMatchup.id]
          );
        }
      }
    }

    // Close voting window
    const closedVotingWindow: VotingWindow = { isActive: false, currentRound: null };
    await pool.query(
      `UPDATE sessions 
       SET voting_window = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(closedVotingWindow), sessionId]
    );

    res.json({
      message: 'Voting ended and winners advanced',
      winnersAdvanced,
      round: currentRound
    });
  } catch (error) {
    console.error('Error ending voting:', error);
    res.status(500).json({ error: 'Failed to end voting' });
  }
};
