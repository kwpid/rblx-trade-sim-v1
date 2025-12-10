# Deploying to Render

This project is set up as a **Monorepo** (Client + Server in one repository). The easiest way to deploy it on Render is as a **Web Service** that serves both the API and the static React frontend.

## 1. Prerequisites
- A GitHub repository containing this code.
- A [Render](https://render.com) account.
- A Supabase project (Database).

## 2. Render Configuration

1.  **Create a New Web Service** on Render.
2.  **Connect your GitHub repository**.
3.  **Settings**:
    *   **Name**: `roblox-trade-sim` (or whatever you like)
    *   **Region**: Closest to you.
    *   **Branch**: `main` (or your working branch)
    *   **Root Directory**: `.` (Leave empty / default)
    *   **Runtime**: `Node`
    *   **Build Command**: `npm run build`
        *   *Note: This runs the script in `package.json` which installs dependencies for both server and client, and builds the client.*
    *   **Start Command**: `npm start`
        *   *Note: This runs `node server/index.js`.*

## 3. Environment Variables
You must add the following Environment Variables in the Render Dashboard (Environment tab):

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | **Important**: Tells the server to serve the client static files. |
| `DATABASE_URL` | `postgres://...` | Connection string from Supabase (Transaction Pooler usually best). |
| `SUPABASE_URL` | `https://xyz.supabase.co` | Your Supabase Project URL. |
| `SUPABASE_KEY` | `eyJ...` | Your Supabase Service Role Key (or Anon Key if only client usage, but server usually needs Service Role for admin tasks). Prefer Service Role for server-side logic. |
| `SESSION_SECRET` | `some_long_random_string` | Secret for session management. |
| `DISCORD_WEBHOOK_URL_ITEMS` | `https://discord.com/api/webhooks/...` | (Optional) For item release notifications. |

## 4. Verification
Once deployed:
1.  Render will run the Build Command (installing modules, building React).
2.  Render will run the Start Command (starting Express).
3.  Open the Render URL (e.g., `https://roblox-trade-sim.onrender.com`).
4.  You should see the React app.
5.  API requests (e.g., `/api/items`) should work.

## Troubleshooting
- **Build Fails**: Check the logs. Ensure `npm install` succeeded in both folders. The verify the `build` script in `package.json` is `npm install && cd client && npm install --include=dev && npm run build`.
- **White Screen**: Console errors about "file not found"? Ensure `NODE_ENV` is set to `production` so Express serves the `client/dist` folder.
- **Database Connection Error**: Double check `DATABASE_URL` and `SUPABASE_KEY`. Ensure Supabase allows connections from anywhere (0.0.0.0/0) or Render's IP.
