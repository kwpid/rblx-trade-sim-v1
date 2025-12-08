# Roblox Trade Simulator

A full-stack web application that simulates the Roblox marketplace and trading system.

## Features

- **User Authentication**: Sign up and login with username/email
- **Marketplace**: Browse and purchase items from the catalog
- **Trading System**: Trade items and cash with other players
- **Admin Panel**: Upload items using Roblox Item IDs (auto-fetches from Rolimons API)
- **Item Management**: 
  - Stock-based items (limited copies)
  - Timer-based items (limited time sale)
  - Off-sale items (admin-only trading)
- **Paycheck System**: Earn 250R$ per minute
- **Notifications**: Real-time notifications for item releases and trades
- **RAP Tracking**: View RAP (Recent Average Price) graphs for items
- **Leaderboard**: See top players by cash

## Tech Stack

- **Backend**: Node.js, Express
- **Frontend**: React, Vite
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT
- **API Integration**: Rolimons API for Roblox item data

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd rblx-trade-sim-v1-1
```

### 2. Set Up Supabase

Follow the instructions in `SUPABASE_SETUP.md` to:
- Create a Supabase project
- Set up database tables
- Get your credentials

### 3. Install Dependencies

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
JWT_SECRET=your_random_secret_key
PORT=5000
NODE_ENV=development
```

### 5. Run the Application

**Development mode:**
```bash
npm run dev
```

This will start:
- Backend server on `http://localhost:5000`
- Frontend dev server on `http://localhost:3000`

**Production mode:**
```bash
npm run build
npm start
```

## Making Yourself an Admin

1. Register an account on the site
2. Go to your Supabase dashboard → SQL Editor
3. Run:
```sql
UPDATE users SET is_admin = TRUE WHERE username = 'YOUR_USERNAME';
```

## Deploying to Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set build command: `npm install && cd client && npm install && npm run build`
4. Set start command: `npm start`
5. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `JWT_SECRET`
   - `NODE_ENV=production`
   - `PORT` (Render will set this automatically)

## Project Structure

```
.
├── server/
│   ├── routes/          # API routes
│   ├── middleware/      # Auth middleware
│   ├── config/          # Supabase config
│   ├── utils/           # Utility functions (Rolimons API)
│   ├── jobs/            # Background jobs (paycheck)
│   └── index.js         # Server entry point
├── client/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── contexts/    # React contexts
│   │   └── App.jsx      # Main app component
│   └── package.json
├── SUPABASE_SETUP.md    # Supabase setup guide
└── package.json
```

## API Endpoints

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/items` - Get all items
- `POST /api/admin/items` - Create item (admin only)
- `POST /api/marketplace/purchase` - Purchase item
- `POST /api/trades` - Create trade offer
- `GET /api/users/leaderboard` - Get leaderboard

## License

MIT

