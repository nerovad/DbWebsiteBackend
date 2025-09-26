// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId?: number;
  user?: any;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: number };
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};
