import express from "express";
import { rateEntry, getLeaderboard, createRatingFromChannelFilm } from "../controllers/voteController";

const router = express.Router();

// New: what your Menu.tsx expects
router.post("/ratings", createRatingFromChannelFilm);

// Existing session-scoped endpoints
router.post("/sessions/:sessionId/entries/:entryId/rate", rateEntry);
router.get("/sessions/:sessionId/leaderboard", getLeaderboard);

export default router;
