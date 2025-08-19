import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import pool from "../db/pool";

export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Access Denied" });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: number };
    const result = await pool.query(
      "SELECT id, username, email, created_at FROM users WHERE id = $1",
      [decoded.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    // On token errors, respond 401 instead of throwing
    res.status(401).json({ error: "Invalid Token" });
  }
}
