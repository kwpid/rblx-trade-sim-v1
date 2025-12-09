# Supabase Setup Instructions

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - Project name: `roblox-trade-simulator`
   - Database password: (choose a strong password)
   - Region: (choose closest to you)
5. Click "Create new project"
6. Wait for the project to be created (takes a few minutes)

## Step 2: Get Your Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following:
   - **Project URL** (this is your `SUPABASE_URL`)
   - **anon/public key** (this is your `SUPABASE_ANON_KEY`)

## Step 3: Create Database Tables

Go to **SQL Editor** in your Supabase dashboard and run the following SQL:

```sql
-- Users table
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  cash BIGINT DEFAULT 100000,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Items table
CREATE TABLE items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  roblox_item_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  initial_price BIGINT NOT NULL,
  current_price BIGINT NOT NULL,
  sale_type VARCHAR(20) CHECK (sale_type IN ('stock', 'timer')),
  stock_count INTEGER,
  remaining_stock INTEGER,
  sale_end_time TIMESTAMP,
  is_limited BOOLEAN DEFAULT FALSE,
  is_off_sale BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- User items (inventory)
CREATE TABLE user_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  purchase_price BIGINT NOT NULL,
  is_for_sale BOOLEAN DEFAULT FALSE,
  sale_price BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Trades table
CREATE TABLE trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
  offered_items UUID[] DEFAULT '{}',
  requested_items UUID[] DEFAULT '{}',
  offered_cash BIGINT DEFAULT 0,
  requested_cash BIGINT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Item RAP history
CREATE TABLE item_rap_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  rap_value BIGINT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_user_items_user_id ON user_items(user_id);
CREATE INDEX idx_user_items_item_id ON user_items(item_id);
CREATE INDEX idx_user_items_for_sale ON user_items(is_for_sale) WHERE is_for_sale = TRUE;
CREATE INDEX idx_items_limited ON items(is_limited) WHERE is_limited = TRUE;
CREATE INDEX idx_items_off_sale ON items(is_off_sale) WHERE is_off_sale = FALSE;
CREATE INDEX idx_trades_user ON trades(sender_id, recipient_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_rap_history_item ON item_rap_history(item_id);
```

## Step 4: Create Player Snapshots Table (Required for Value/RAP Charts)

Go to **SQL Editor** in your Supabase dashboard and run the following SQL from `player_snapshots_migration.sql`:

```sql
-- Create player snapshots table for daily value/rap tracking
CREATE TABLE IF NOT EXISTS player_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  total_value BIGINT NOT NULL DEFAULT 0,
  total_rap BIGINT NOT NULL DEFAULT 0,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, snapshot_date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_player_snapshots_user ON player_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_player_snapshots_date ON player_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_player_snapshots_user_date ON player_snapshots(user_id, snapshot_date DESC);
```

**Note:** This table is required for the player value/RAP charts feature. Without it, you'll see errors when viewing player profiles.

## Step 4: Set Up Row Level Security (RLS)

Run this SQL in the SQL Editor:

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_rap_history ENABLE ROW LEVEL SECURITY;

-- Users: Can read all, update own
CREATE POLICY "Users can read all" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own" ON users FOR UPDATE USING (auth.uid()::text = id::text);

-- Items: Can read all
CREATE POLICY "Items are viewable by all" ON items FOR SELECT USING (true);

-- User items: Can read all, insert/update own
CREATE POLICY "User items are viewable by all" ON user_items FOR SELECT USING (true);
CREATE POLICY "Users can manage own items" ON user_items FOR ALL USING (auth.uid()::text = user_id::text);

-- Trades: Can read own trades
CREATE POLICY "Users can read own trades" ON trades FOR SELECT USING (auth.uid()::text = sender_id::text OR auth.uid()::text = recipient_id::text);
CREATE POLICY "Users can create trades" ON trades FOR INSERT WITH CHECK (auth.uid()::text = sender_id::text);

-- Notifications: Can read own
CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid()::text = user_id::text);

-- RAP history: Can read all
CREATE POLICY "RAP history is viewable by all" ON item_rap_history FOR SELECT USING (true);
```

**Note:** Since we're using JWT authentication from our backend, RLS might need to be adjusted. For now, you can disable RLS if you encounter issues, but it's recommended to keep it enabled for security.

## Step 5: Make Yourself an Admin

Run this SQL (replace `YOUR_USERNAME` with your actual username):

```sql
UPDATE users SET is_admin = TRUE WHERE username = 'YOUR_USERNAME';
```

Or if you know your user ID:

```sql
UPDATE users SET is_admin = TRUE WHERE id = 'YOUR_USER_ID';
```

## Step 6: Set Environment Variables

Create a `.env` file in the root of your project:

```env
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
JWT_SECRET=your_random_secret_key_here
PORT=5000
NODE_ENV=development
```

Replace:
- `your_supabase_url_here` with your Project URL
- `your_supabase_anon_key_here` with your anon/public key
- `your_random_secret_key_here` with a random string (for JWT signing)

## Step 7: Test the Connection

1. Install dependencies: `npm install`
2. Start the server: `npm run server`
3. You should see "Server running on port 5000"

If you encounter any issues, check:
- Your Supabase credentials are correct
- All tables were created successfully
- RLS policies are set up correctly (or disabled for testing)

