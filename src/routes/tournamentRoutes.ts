import { Router } from "express";
import {
  getTournament,
  voteOnMatchup,
  advanceWinner,
  advanceAllInRound
} from "../controllers/tournamentController";
// import { authenticateAdmin } from "../middleware/auth"; // If you have admin middleware

const router = Router();

// Get tournament bracket for a channel
router.get("/channels/:channelId/tournament", getTournament);

// Vote on a matchup (public or authenticated)
router.post("/tournaments/matchups/:matchupId/vote", voteOnMatchup);

// Advance winner to next round (admin only - comment out auth for now)
// router.post("/tournaments/matchups/:matchupId/advance", authenticateAdmin, advanceWinner);
router.post("/tournaments/matchups/:matchupId/advance", advanceWinner);

// Advance entire round (admin only)
router.post("/tournaments/rounds/:sessionId/:roundNumber/advance-all", advanceAllInRound);

export default router;
