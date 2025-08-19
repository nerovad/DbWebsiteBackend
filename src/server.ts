import dotenv from "dotenv";
import path from "path";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import setupSocket from "./sockets/chatSocket"; // ✅ fixed
import authRoutes from "./routes/authRoutes";
import chatRoutes from "./routes/chatRoutes";
import voteRoutes from "./routes/voteRoutes";
import profileRoutes from "./routes/profileRoutes";
import errorHandler from "./middleware/errorHandler"; // ✅ fixed
import pool from "./db/pool";


dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  },
});

const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", chatRoutes);
app.use("/api/sessions", voteRoutes);
app.use("/api/profile", profileRoutes);

// Error Handler
app.use(errorHandler);

// Socket Setup
setupSocket(io, pool);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
