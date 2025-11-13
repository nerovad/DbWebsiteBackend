import { Router } from "express";

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
// PUBLIC ROUTES - Tournament Viewing & Voting
// ============================================

// Get tournament bracket for a channel (public)
router.get("/channels/:channelId/tournament", getTournament);

// Vote on a matchup (auth checked in controller)
router.post("/tournaments/matchups/:matchupId/vote", voteOnMatchup);

// ============================================
// MANAGEMENT ROUTES - Tournament Console (Owner Only)
// ============================================

// Get tournament status for console dashboard (auth checked in controller)
router.get("/tournaments/:sessionId/status", getTournamentStatus);

// Start voting window for a round (auth checked in controller)
router.post("/tournaments/:sessionId/voting/start", startVoting);

// End voting window and advance winners (auth checked in controller)
router.post("/tournaments/:sessionId/voting/end", endVoting);

// ============================================
// ADMIN ROUTES - Manual Advancement (Testing/Admin)
// ============================================

// Manually advance winner to next round
router.post("/tournaments/matchups/:matchupId/advance", advanceWinner);

// Manually advance entire round
router.post("/tournaments/rounds/:sessionId/:roundNumber/advance-all", advanceAllInRound);

export default router;
