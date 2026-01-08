// src/routes/streamAuthRoutes.ts
import express from "express";
import { verifyStreamKey } from "../controllers/streamAuthController";

const router = express.Router();
router.post("/auth", verifyStreamKey);

export default router;
