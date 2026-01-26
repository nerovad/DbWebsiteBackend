import express, { Response, NextFunction } from "express";
import {
  getConversations,
  getMessages,
  markAsRead,
  sendMessage,
  searchUsers
} from "../controllers/directMessageController";
import { authenticateToken, AuthRequest } from "../middleware/authMiddleware";

const router = express.Router();

// All direct message routes require authentication
router.use(authenticateToken);

// GET /api/messages/conversations - Get all conversations
router.get("/conversations", (req: AuthRequest, res: Response, next: NextFunction): void => {
  getConversations(req, res).catch(next);
});

// GET /api/messages/users/search - Search users to message
router.get("/users/search", (req: AuthRequest, res: Response, next: NextFunction): void => {
  searchUsers(req, res).catch(next);
});

// POST /api/messages/send - Send a new message
router.post("/send", (req: AuthRequest, res: Response, next: NextFunction): void => {
  sendMessage(req, res).catch(next);
});

// GET /api/messages/:userId - Get messages with a specific user
router.get("/:userId", (req: AuthRequest, res: Response, next: NextFunction): void => {
  getMessages(req, res).catch(next);
});

// POST /api/messages/:userId/read - Mark messages from user as read
router.post("/:userId/read", (req: AuthRequest, res: Response, next: NextFunction): void => {
  markAsRead(req, res).catch(next);
});

export default router;
