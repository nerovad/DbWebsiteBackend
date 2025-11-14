import { Router } from "express";
import { authenticateToken, AuthRequest } from "../middleware/authMiddleware";

// Import from existing tournament controller
import {
  getTournament,
  voteOnMatchup,
  advanceWinner,
  advanceAllInRound
} from "../controllers/tournamentController";

// Import from new tournament voting controller
import {
  getTournamentStatus,
  startVoting,
  endVoting
} from "../controllers/tournamentVotingController";

const router = Router();

// ============================================
// PUBLIC ROUTES - Tournament Viewing
// ============================================

// Get tournament bracket for a channel (public)
router.get("/channels/:channelId/tournament", getTournament);

// ============================================
// AUTHENTICATED ROUTES
// ============================================

// Vote on a matchup (requires auth, checks voting window)
router.post("/tournaments/matchups/:matchupId/vote", authenticateToken, voteOnMatchup);

// Get tournament status for console dashboard (requires auth)
router.get("/tournaments/:sessionId/status", authenticateToken, getTournamentStatus);

// Start voting window for a round (requires auth)
router.post("/tournaments/:sessionId/voting/start", authenticateToken, startVoting);

// End voting window and advance winners (requires auth)
router.post("/tournaments/:sessionId/voting/end", authenticateToken, endVoting);

// Manually advance winner to next round (requires auth)
router.post("/tournaments/matchups/:matchupId/advance", authenticateToken, advanceWinner);

// Manually advance entire round (requires auth)
router.post("/tournaments/rounds/:sessionId/:roundNumber/advance-all", authenticateToken, advanceAllInRound);

export default router;
