import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { Pool } from "pg";
import { body, validationResult } from "express-validator";

dotenv.config();
const app = express();
const server = require("http").createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5174",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
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
  console.log(` User Connected: ${socket.id}`);

  // Listen for incoming messages
  socket.on("sendMessage", async ({ userId, message }) => {
    if (!userId || !message) return;

    // Save message in PostgreSQL
    const result = await pool.query(
      "INSERT INTO messages (user_id, content) VALUES ($1, $2) RETURNING *",
      [userId, message]
    );

    // Broadcast message to all clients
    io.emit("receiveMessage", result.rows[0]);
  });

  socket.on("disconnect", () => {
    console.log(` User Disconnected: ${socket.id}`);
  });
});

/*  Fetch Chat History */
app.get("/messages", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT messages.id, messages.content, messages.created_at, users.email FROM messages JOIN users ON messages.user_id = users.id ORDER BY messages.created_at ASC"
    );
    res.json(result.rows);
  } catch (error) {
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
    const result = await pool.query("SELECT email, created_at FROM users WHERE id = $1", [decoded.id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(401).json({ error: "Invalid Token" });
  }
});

/*  Error Handling Middleware */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Internal Server Error" });
});

server.listen(PORT, () => console.log(` Server running on port ${PORT}`));

