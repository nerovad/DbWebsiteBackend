import path from "path";
import dotenv from "dotenv";
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
import pool from "../db/pool";
import channelRoutes from "./routes/channelRoutes";
import festivalRoutes from "./routes/festivalRoutes";
import filmRoutes from "./routes/filmRoutes";
import bodyParser from "body-parser";
import rtmpRoutes from "./routes/rtmpRoutes";
import awardRoutes from "./routes/awardRoutes";
import companyRoutes from "./routes/companyRoutes";

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
app.use(express.urlencoded({ extended: false }));
app.use("/api/auth", authRoutes);
app.use("/api/messages", chatRoutes);
app.use("/api", voteRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/channels", channelRoutes);
app.use("/api/festivals", festivalRoutes);  // sessions control
app.use("/api/films", filmRoutes);
app.use("/api/awards", awardRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/rtmp", rtmpRoutes);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());

// Error Handler
app.use(errorHandler);

// Socket Setup
setupSocket(io, pool);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
