import { body } from "express-validator";


export const validateRegister = [
  body("email").isEmail().withMessage("Enter a valid email"),
  body("username").notEmpty().withMessage("Username is required"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
];


// 11. src/db.ts
import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();


export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});
