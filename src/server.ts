import dotenv from "dotenv";
import path from "path";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { Pool } from "pg";
import { body, validationResult } from "express-validator";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASSWORD:", process.env.DB_PASSWORD ? "Loaded" : "Not Loaded");



const app = express();
const server = require("http").createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  },
});
const PORT = process.env.PORT || 5000;

//  PostgreSQL Connection (pg)
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});


app.use(express.json());
app.use(cors());

/* WebSocket Connection */
io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  socket.on("joinRoom", async ({ channelId }) => {
    try {
      // Leave any old rooms
      for (const room of socket.rooms) if (room !== socket.id) socket.leave(room);

      // Join by slug (room name stays the slug)
      socket.join(channelId);

      // Resolve numeric channel id
      const ch = await pool.query<{ id: number }>(
        "SELECT id FROM channels WHERE slug = $1 LIMIT 1",
        [channelId]
      );
      const channelDbId = ch.rows[0]?.id ?? null;

      // Find live/scheduled session (optional, recommended)
      let sessionId: number | null = null;
      if (channelDbId) {
        const sess = await pool.query<{ id: number }>(
          `SELECT id
           FROM sessions
           WHERE channel_id = $1
             AND now() BETWEEN starts_at AND COALESCE(ends_at, now() + interval '100 years')
             AND status IN ('scheduled','live')
           ORDER BY starts_at DESC
           LIMIT 1`,
          [channelDbId]
        );
        sessionId = sess.rows[0]?.id ?? null;
      }

      // Fetch chat history (session-scoped if active, else channel-wide by numeric id)
      const result = sessionId
        ? await pool.query(
          `SELECT m.id, m.content, m.created_at, u.username
             FROM messages m
             JOIN users u ON u.id = m.user_id
             WHERE m.session_id = $1
             ORDER BY m.created_at ASC`,
          [sessionId]
        )
        : channelDbId
          ? await pool.query(
            `SELECT m.id, m.content, m.created_at, u.username
             FROM messages m
             JOIN users u ON u.id = m.user_id
             WHERE m.channel_id = $1
             ORDER BY m.created_at ASC`,
            [channelDbId]
          )
          : { rows: [] } as any;

      socket.data = { channelSlug: channelId, channelDbId, sessionId };
      socket.emit("chatHistory", result.rows);
    } catch (err) {
      console.error("joinRoom error:", err);
      socket.emit("chatHistory", []);
    }
  });

  socket.on("sendMessage", async ({ userId, message, channelId }) => {
    try {
      if (!userId || !channelId || !message?.trim()) return;

      const u = await pool.query<{ username: string }>(
        "SELECT username FROM users WHERE id = $1",
        [userId]
      );
      if (u.rowCount === 0) return;
      const username = u.rows[0].username;

      let { channelDbId, sessionId } = socket.data ?? {};
      if (!channelDbId) {
        const ch = await pool.query<{ id: number }>(
          "SELECT id FROM channels WHERE slug = $1 LIMIT 1",
          [channelId]
        );
        channelDbId = ch.rows[0]?.id ?? null;
      }

      const ins = await pool.query(
        `INSERT INTO messages (user_id, content, channel_id, session_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, content, created_at`,
        [userId, message.trim(), channelDbId, sessionId ?? null]
      );

      io.to(channelId).emit("receiveMessage", {
        id: ins.rows[0].id,
        content: ins.rows[0].content,
        created_at: ins.rows[0].created_at,
        user: username,
      });
    } catch (err) {
      console.error("sendMessage error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User Disconnected: ${socket.id}`);
  });
});

/*  Fetch Chat History (optional filters) */
app.get("/messages", async (req, res) => {
  try {
    const { channelSlug, sessionId } = req.query as { channelSlug?: string; sessionId?: string };

    let result;
    if (sessionId) {
      result = await pool.query(
        `SELECT m.id, m.content, m.created_at, u.username
         FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.session_id = $1
         ORDER BY m.created_at ASC`,
        [Number(sessionId)]
      );
    } else if (channelSlug) {
      result = await pool.query(
        `SELECT m.id, m.content, m.created_at, u.username
         FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.channel_id = $1
         ORDER BY m.created_at ASC`,
        [channelSlug]
      );
    } else {
      // Global history (unchanged)
      result = await pool.query(
        `SELECT m.id, m.content, m.created_at, u.username
         FROM messages m
         JOIN users u ON u.id = m.user_id
         ORDER BY m.created_at ASC`
      );
    }

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error fetching messages" });
  }
});

/* Register User */
app.post(
  "/register",
  [
    body("email").isEmail().withMessage("Enter a valid email"),
    body("username").notEmpty().withMessage("Username is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { email, username, password } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await pool.query(
        "INSERT INTO users (email, username, password) VALUES ($1, $2, $3) RETURNING id, email, username",
        [email, username, hashedPassword]
      );

      res.json({ message: "User created successfully", user: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

/* Login User */
app.post("/login", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, username, password } = req.body;

    if (!email && !username) {
      res.status(400).json({ error: "Email or Username is required" });
      return;
    }

    // Query by either email or username
    const result = await pool.query(
      "SELECT * FROM users WHERE email = COALESCE($1, email) OR username = COALESCE($2, username) LIMIT 1",
      [email, username]
    );

    const user = result.rows[0];
    if (!user) {
      res.status(400).json({ error: "Invalid credentials" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(400).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
    res.json({ token });

  } catch (error) {
    next(error);
  }
});

/* Protected Profile Route */
app.get("/profile", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Access Denied" });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: number };
    console.log("Decoded user ID:", decoded.id);

    const result = await pool.query("SELECT id, username, email, created_at FROM users WHERE id = $1", [decoded.id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error in /profile:", error);
    res.status(401).json({ error: "Invalid Token" });
  }
});
/* Cast or update a rating for a film entry */
app.post("/sessions/:sessionId/entries/:entryId/rate", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const entryId = Number(req.params.entryId);
    const { score } = req.body;

    // TODO: replace this with your real auth middleware
    const userId = (req as any).user?.id || 1;

    // Ensure a ballot exists for this session+user
    const ballot = await pool.query(
      `INSERT INTO ballots (session_id, user_id, weight)
       VALUES ($1, $2, 1.0)
       ON CONFLICT (session_id, user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING id`,
      [sessionId, userId]
    );

    await pool.query(
      `INSERT INTO ratings (session_id, entry_id, ballot_id, score)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id, entry_id, ballot_id)
       DO UPDATE SET score = EXCLUDED.score, created_at = now()`,
      [sessionId, entryId, ballot.rows[0].id, score]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Error rating:", err);
    res.status(500).json({ error: "Error saving rating" });
  }
});

/* Get leaderboard for a session */
app.get("/sessions/:sessionId/leaderboard", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);

    const { rows } = await pool.query(
      `SELECT
         se.id AS entry_id,
         f.title,
         ROUND(SUM(r.score * COALESCE(b.weight,1)) / NULLIF(SUM(COALESCE(b.weight,1)),0), 3) AS weighted_avg,
         COUNT(*) AS votes
       FROM ratings r
       JOIN ballots b ON (b.session_id = r.session_id AND b.id = r.ballot_id)
       JOIN session_entries se ON se.id = r.entry_id
       JOIN films f ON f.id = se.film_id
       WHERE r.session_id = $1
       GROUP BY se.id, f.title
       ORDER BY weighted_avg DESC, votes DESC`,
      [sessionId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error leaderboard:", err);
    res.status(500).json({ error: "Error fetching leaderboard" });
  }
});

/*  Error Handling Middleware */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Internal Server Error" });
});

server.listen(PORT, () => console.log(` Server running on port ${PORT}`));

