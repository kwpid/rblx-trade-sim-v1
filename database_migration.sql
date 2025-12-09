-- Add new columns to items table for value tracking
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS value BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS trend VARCHAR(20) DEFAULT 'stable' CHECK (trend IN ('declining', 'stable', 'rising')),
ADD COLUMN IF NOT EXISTS demand VARCHAR(20) DEFAULT 'unknown' CHECK (demand IN ('very_low', 'low', 'medium', 'high', 'very_high', 'unknown')),
ADD COLUMN IF NOT EXISTS value_update_explanation TEXT,
ADD COLUMN IF NOT EXISTS value_updated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS buy_limit INTEGER;

-- Update existing items to have value = 0 if NULL
UPDATE items SET value = 0 WHERE value IS NULL;

-- Create value change history table
CREATE TABLE IF NOT EXISTS value_change_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  previous_value BIGINT,
  new_value BIGINT,
  previous_trend VARCHAR(20),
  new_trend VARCHAR(20),
  previous_demand VARCHAR(20),
  new_demand VARCHAR(20),
  explanation TEXT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_value_change_history_item ON value_change_history(item_id);
CREATE INDEX IF NOT EXISTS idx_value_change_history_created ON value_change_history(created_at DESC);

