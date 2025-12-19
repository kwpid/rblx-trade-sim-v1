const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate, getOnlineUsers } = require('../middleware/auth');
const { checkAndAwardBadges } = require('../services/badgeService');

// Get user profile
router.get('/:id', async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, cash, is_admin, created_at, is_online, banned_until, badges')
      .eq('id', req.params.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Get user inventory
router.get('/:id/inventory', async (req, res) => {
  try {
    const { data: items, error } = await supabase
      .from('user_items')
      .select(`
        *,
        items:item_id (*)
      `)
      .eq('user_id', req.params.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Mask non-limited item values
    const maskedItems = (items || []).map(ui => {
      if (ui.items && !ui.items.is_limited) {
        ui.items.value = 0;
      }
      return ui;
    });

    res.json(maskedItems);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Get current user
router.get('/me/profile', authenticate, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, cash, is_admin, created_at, banned_until, min_trade_value, trade_privacy, inventory_privacy, message_privacy, badges')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;
    res.json(user);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user settings
router.patch('/me/settings', authenticate, async (req, res) => {
  try {
    const { min_trade_value, trade_privacy, inventory_privacy, message_privacy } = req.body;

    // Validate inputs
    const updates = {};
    if (min_trade_value !== undefined) {
      const minVal = parseInt(min_trade_value);
      if (isNaN(minVal) || minVal < 0 || minVal > 100000) {
        return res.status(400).json({ error: 'Min trade value must be between 0 and 100,000' });
      }
      updates.min_trade_value = minVal;
    }

    const validPrivacy = ['everyone', 'friends', 'none'];
    if (trade_privacy && validPrivacy.includes(trade_privacy)) updates.trade_privacy = trade_privacy;
    if (inventory_privacy && validPrivacy.includes(inventory_privacy)) updates.inventory_privacy = inventory_privacy;
    if (message_privacy && validPrivacy.includes(message_privacy)) updates.message_privacy = message_privacy;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid settings provided' });
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select('min_trade_value, trade_privacy, inventory_privacy, message_privacy')
      .single();

    if (error) throw error;

    res.json({ message: 'Settings updated', settings: data });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Check if user owns a specific item (more efficient than fetching all inventory)
router.get('/me/owns/:itemId', authenticate, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { itemId } = req.params;

    // Get user_items for this specific item
    const { data: userItems, error } = await supabase
      .from('user_items')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('item_id', itemId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Supabase error checking ownership:', error);
      return res.status(500).json({
        error: 'Failed to check ownership',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    res.json(userItems || []);
  } catch (error) {
    console.error('Error checking ownership:', error);
    res.status(500).json({
      error: 'Failed to check ownership',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


// Manual Badge Scan Endpoint
router.post('/me/badges/scan', authenticate, async (req, res) => {
  try {
    await checkAndAwardBadges(req.user.id);

    // Fetch updated user to return latest badges
    const { data: user } = await supabase
      .from('users')
      .select('badges')
      .eq('id', req.user.id)
      .single();

    res.json({ success: true, badges: user?.badges || [] });
  } catch (error) {
    console.error('Error scanning badges:', error);
    res.status(500).json({ error: 'Failed to scan badges' });
  }
});

// Get current user inventory
router.get('/me/inventory', authenticate, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // First, get user_items
    const { data: userItems, error: userItemsError } = await supabase
      .from('user_items')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (userItemsError) {
      console.error('Supabase error fetching user_items:', userItemsError);
      throw userItemsError;
    }

    if (!userItems || userItems.length === 0) {
      return res.json([]);
    }

    // Get all unique item IDs
    const itemIds = [...new Set(userItems.map(ui => ui.item_id))];

    // Fetch items separately
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select('*')
      .in('id', itemIds);

    if (itemsError) {
      console.error('Supabase error fetching items:', itemsError);
      throw itemsError;
    }

    // Combine user_items with items data
    const itemsMap = new Map();
    if (items) {
      items.forEach(item => {
        itemsMap.set(item.id, item);
      });
    }

    const result = userItems.map(userItem => {
      const itemData = itemsMap.get(userItem.item_id) || null;
      if (itemData && !itemData.is_limited) {
        itemData.value = 0; // Mask
      }
      return {
        ...userItem,
        items: itemData
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({
      error: 'Failed to fetch inventory',
    });
  }
});


// Leaderboard Cache
const leaderboardCache = {
  cash: { data: null, expire: 0 },
  value: { data: null, expire: 0 },
  rap: { data: null, expire: 0 }
};

// Get leaderboard by cash
router.get('/leaderboard', async (req, res) => {
  try {
    const ADMIN_USER_ID = '0c55d336-0bf7-49bf-9a90-1b4ba4e13679';

    // Try to get from snapshots first
    const { data: snapshots, error: snapshotError } = await supabase
      .from('player_snapshots')
      .select('user_id, cash_balance')
      .neq('user_id', ADMIN_USER_ID)
      .order('snapshot_date', { ascending: false });

    if (!snapshotError && snapshots && snapshots.length > 0) {
      // Get usernames separately
      const userIds = [...new Set(snapshots.map(s => s.user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);

      const usernameMap = new Map(users?.map(u => [u.id, u.username]) || []);

      const userMap = new Map();
      snapshots.forEach(snapshot => {
        if (!userMap.has(snapshot.user_id)) {
          userMap.set(snapshot.user_id, {
            id: snapshot.user_id,
            username: usernameMap.get(snapshot.user_id) || 'Unknown',
            cash: snapshot.cash_balance || 0
          });
        }
      });

      const leaderboard = Array.from(userMap.values())
        .sort((a, b) => b.cash - a.cash)
        .slice(0, 10);

      return res.json(leaderboard);
    }

    // Fallback to users table
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, cash')
      .neq('id', ADMIN_USER_ID)
      .order('cash', { ascending: false })
      .limit(10);

    if (error) throw error;
    res.json(users);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get leaderboard by value
router.get('/leaderboard/value', async (req, res) => {
  try {
    const ADMIN_USER_ID = '0c55d336-0bf7-49bf-9a90-1b4ba4e13679';

    // Try snapshots first
    const { data: snapshots, error: snapshotError } = await supabase
      .from('player_snapshots')
      .select('user_id, inventory_value')
      .neq('user_id', ADMIN_USER_ID)
      .order('snapshot_date', { ascending: false });

    if (!snapshotError && snapshots && snapshots.length > 0) {
      const userIds = [...new Set(snapshots.map(s => s.user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);

      const usernameMap = new Map(users?.map(u => [u.id, u.username]) || []);

      const userMap = new Map();
      snapshots.forEach(snapshot => {
        if (!userMap.has(snapshot.user_id)) {
          userMap.set(snapshot.user_id, {
            id: snapshot.user_id,
            username: usernameMap.get(snapshot.user_id) || 'Unknown',
            value: snapshot.inventory_value || 0
          });
        }
      });

      const leaderboard = Array.from(userMap.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      return res.json(leaderboard);
    }

    // Fallback: calculate from user_items
    // Fetch top 100 users (using cash as a heuristic for potential richness, or just generally active users)
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, username')
      .neq('id', ADMIN_USER_ID)
      .limit(100); // Analyze top 100 candidates

    if (userError) throw userError;

    // Parallel calculation for these candidates
    const leaderboard = await Promise.all((users || []).map(async (u) => {
      // Calculate inventory value
      const { data: inventory } = await supabase
        .from('user_items')
        .select('items:item_id (value, rap, is_limited)')
        .eq('user_id', u.id);

      let totalValue = 0;
      if (inventory) {
        inventory.forEach(item => {
          const i = item.items;
          if (i && i.is_limited) {
            // Use Value if present, else RAP
            totalValue += (i.value || i.rap || 0);
          }
        });
      }
      return { id: u.id, username: u.username, value: totalValue };
    }));

    // Sort and slice
    leaderboard.sort((a, b) => b.value - a.value);
    res.json(leaderboard.slice(0, 10));
  } catch (error) {
    console.error('Error fetching value leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get leaderboard by RAP
router.get('/leaderboard/rap', async (req, res) => {
  try {
    const ADMIN_USER_ID = '0c55d336-0bf7-49bf-9a90-1b4ba4e13679';

    // Try snapshots first
    const { data: snapshots, error: snapshotError } = await supabase
      .from('player_snapshots')
      .select('user_id, inventory_rap')
      .neq('user_id', ADMIN_USER_ID)
      .order('snapshot_date', { ascending: false });

    if (!snapshotError && snapshots && snapshots.length > 0) {
      const userIds = [...new Set(snapshots.map(s => s.user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);

      const usernameMap = new Map(users?.map(u => [u.id, u.username]) || []);

      const userMap = new Map();
      snapshots.forEach(snapshot => {
        if (!userMap.has(snapshot.user_id)) {
          userMap.set(snapshot.user_id, {
            id: snapshot.user_id,
            username: usernameMap.get(snapshot.user_id) || 'Unknown',
            rap: snapshot.inventory_rap || 0
          });
        }
      });

      const leaderboard = Array.from(userMap.values())
        .sort((a, b) => b.rap - a.rap)
        .slice(0, 10);

      return res.json(leaderboard);
    }

    // Fallback: real calculation
    // Fetch top 100 users
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, username')
      .neq('id', ADMIN_USER_ID)
      .limit(100);

    if (userError) throw userError;

    // Parallel calculation
    const leaderboard = await Promise.all((users || []).map(async (u) => {
      const { data: inventory } = await supabase
        .from('user_items')
        .select('items:item_id (rap, is_limited)')
        .eq('user_id', u.id);

      let totalRap = 0;
      if (inventory) {
        inventory.forEach(item => {
          const i = item.items;
          if (i && i.is_limited) {
            totalRap += (i.rap || 0);
          }
        });
      }
      return { id: u.id, username: u.username, rap: totalRap };
    }));

    leaderboard.sort((a, b) => b.rap - a.rap);
    res.json(leaderboard.slice(0, 10));
  } catch (error) {
    console.error('Error fetching RAP leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch RAP leaderboard' });
  }
});

// Track online users (in-memory for now, could be moved to Redis in production)
const onlineUsers = new Map();

// Update user's online status
const updateOnlineStatus = async (userId) => {
  const now = Date.now();
  // Update in-memory
  onlineUsers.set(userId, now);

  // Update DB (Throttled: only if last update was > 1 min ago to save writes)
  // We'll store a separate "lastDbUpdate" map to throttle
  if (!global.lastDbUpdates) global.lastDbUpdates = new Map();
  const lastDb = global.lastDbUpdates.get(userId) || 0;

  if (now - lastDb > 60000) { // 1 minute
    global.lastDbUpdates.set(userId, now);
    // Fire and forget
    supabase.from('users').update({ is_online: true, last_online: new Date().toISOString() }).eq('id', userId).then();
  }

  // Consider user offline if they haven't been active in 5 minutes
  setTimeout(() => {
    const lastSeen = onlineUsers.get(userId);
    if (lastSeen && Date.now() - lastSeen > 5 * 60 * 1000) {
      onlineUsers.delete(userId);
      // Mark offline in DB
      supabase.from('users').update({ is_online: false }).eq('id', userId).then();
    }
  }, 5 * 60 * 1000);
};

// Middleware to update online status
router.use((req, res, next) => {
  if (req.user && req.user.id) {
    updateOnlineStatus(req.user.id);
  }
  next();
});

// Get all players
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, search = '', online_only = 'true' } = req.query;
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    let query = supabase
      .from('users')
      .select('id, username, cash, is_admin, created_at');

    // Filter by search query
    if (search && search.trim() !== '') {
      query = query.ilike('username', `%${search.trim()}%`);
    }

    // Filter by online status
    if (online_only === 'true') {
      const onlineUserIds = getOnlineUsers();

      if (onlineUserIds.length > 0) {
        // AI (is_online=true) OR Real (in onlineUserIds)
        query = query.or(`is_online.eq.true,id.in.(${onlineUserIds.join(',')})`);
      } else {
        // Only AI (since no real users online)
        query = query.eq('is_online', true);
      }
    }

    const { data: users, error } = await query
      .order('cash', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (error) throw error;

    // Calculate inventory value for each user
    const usersWithValue = await Promise.all(users.map(async (user) => {
      try {
        // Get user's inventory
        const { data: inventory, error: inventoryError } = await supabase
          .from('user_items')
          .select(`
            *,
            items:item_id (*)
          `)
          .eq('user_id', user.id);

        if (inventoryError || !inventory || inventory.length === 0) {
          return { ...user, inventory_value: 0 };
        }

        // Get reseller prices for items that are limited or out of stock
        const itemIds = inventory.map(item => item.item_id);
        const { data: resellers } = await supabase
          .from('user_items')
          .select('item_id, sale_price')
          .in('item_id', itemIds)
          .eq('is_for_sale', true)
          .order('sale_price', { ascending: true });

        const resellerPriceMap = new Map();
        if (resellers) {
          resellers.forEach(reseller => {
            if (!resellerPriceMap.has(reseller.item_id) ||
              resellerPriceMap.get(reseller.item_id) > reseller.sale_price) {
              resellerPriceMap.set(reseller.item_id, reseller.sale_price);
            }
          });
        }

        let totalValue = 0;
        let totalRAP = 0;
        inventory.forEach(userItem => {
          const itemData = userItem.items;
          if (!itemData) return;

          const isOutOfStock = itemData.is_off_sale ||
            (itemData.sale_type === 'stock' && itemData.remaining_stock <= 0);

          // VALUE: Only use manual item.value AND only if limited
          let itemValue = 0;
          if (itemData.is_limited && itemData.value !== null && itemData.value !== undefined) {
            itemValue = itemData.value;
          }

          // RAP: Only use RAP for Limited items
          let itemRAP = 0;
          if (itemData.is_limited) {
            itemRAP = itemData.rap || 0;
          }

          totalValue += itemValue;
          totalRAP += itemRAP;
        });

        return { ...user, inventory_value: totalValue, inventory_rap: totalRAP };
      } catch (error) {
        console.error(`Error calculating value for user ${user.id}:`, error);
        return { ...user, inventory_value: 0, inventory_rap: 0 };
      }
    }));

    // Sort by inventory value
    usersWithValue.sort((a, b) => b.inventory_value - a.inventory_value);

    res.json(usersWithValue);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get player snapshots for charts
router.get('/:id/snapshots', async (req, res) => {
  try {
    const { data: snapshots, error } = await supabase
      .from('player_snapshots')
      .select('*')
      .eq('user_id', req.params.id)
      .order('snapshot_date', { ascending: true });

    if (error) throw error;

    res.json(snapshots || []);
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

module.exports = router;
