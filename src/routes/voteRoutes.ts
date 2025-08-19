import express from "express";
import { rateEntry, getLeaderboard } from "../controllers/voteController";
const router = express.Router();


router.post("/sessions/:sessionId/entries/:entryId/rate", rateEntry);
router.get("/sessions/:sessionId/leaderboard", getLeaderboard);


export default router;
