
# DbWebsiteBackend

This is a full-stack application for Dain Bramage TV, featuring a React frontend and a Node.js/Express backend with PostgreSQL and WebSockets (Socket.IO) support.

---

## Project Structure

/dainBramageApp
├── backend/ → Express + PostgreSQL API
├── frontend/ → React (Vite) client
├── .env → Environment variables (not committed)
├── README.md → You are here

---

## ⚙️ Requirements

- Node.js (v18+ recommended)
- PostgreSQL
- `npm` or `yarn`
- Optional: `ts-node-dev` (for live reloading backend in dev)

---

## Starting the App

### 1. frontend

npm install
npm run dev

### 1. Backend

#### Setup

npm install

Start in development mode (with auto-reload)

npx ts-node-dev src/server.ts
