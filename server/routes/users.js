const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate, getOnlineUsers } = require('../middleware/auth');

// Get user profile
router.get('/:id', async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, cash, is_admin, created_at, is_online')
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

    res.json(items);
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
      .select('id, username, email, cash, is_admin, created_at')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    res.json(user);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
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

    const result = userItems.map(userItem => ({
      ...userItem,
      items: itemsMap.get(userItem.item_id) || null
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({
      error: 'Failed to fetch inventory',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get leaderboard by cash
router.get('/leaderboard', async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, cash')
      .order('cash', { ascending: false })
      .limit(10); // Limit to top 10

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
    // 1. Get All Users (Lightweight)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username');

    if (usersError) throw usersError;

    // 2. Bulk Fetch All User Items (Batched would be better for scale, but manageable here)
    const { data: allItems, error: itemsError } = await supabase
      .from('user_items')
      .select(`
        user_id,
        items:item_id (
            value,
            rap,
            is_limited,
            is_off_sale,
            sale_type,
            remaining_stock
        )
      `)
      .not('items', 'is', null); // Filter invalid items

    if (itemsError) throw itemsError;

    // 3. Aggregate in Memory
    const userValueMap = {};

    allItems.forEach(ui => {
      if (!userValueMap[ui.user_id]) userValueMap[ui.user_id] = 0;

      const itemData = ui.items;
      // Strictly use manual value only
      const val = (itemData.value !== null && itemData.value !== undefined) ? itemData.value : 0;

      userValueMap[ui.user_id] += val;
    });

    // 4. Map & Sort
    const leaderboard = users.map(u => ({
      id: u.id,
      username: u.username,
      value: userValueMap[u.id] || 0
    }));

    leaderboard.sort((a, b) => b.value - a.value);

    // 5. Limit to Top 10
    res.json(leaderboard.slice(0, 10));

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get leaderboard by RAP
router.get('/leaderboard/rap', async (req, res) => {
  try {
    // 1. Get All Users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username');

    if (usersError) throw usersError;

    // 2. Bulk Fetch All User Items
    const { data: allItems, error: itemsError } = await supabase
      .from('user_items')
      .select(`
        user_id,
        items:item_id (
            rap,
            is_limited
        )
      `)
      .not('items', 'is', null);

    if (itemsError) throw itemsError;

    // 3. Aggregate in Memory
    const userRAPMap = {};

    allItems.forEach(ui => {
      if (!userRAPMap[ui.user_id]) userRAPMap[ui.user_id] = 0;

      const itemData = ui.items;
      // Strictly use RAP for limiteds only
      let val = 0;
      if (itemData.is_limited) {
        val = itemData.rap || 0;
      }

      userRAPMap[ui.user_id] += val;
    });

    // 4. Map & Sort
    const leaderboard = users.map(u => ({
      id: u.id,
      username: u.username,
      rap: userRAPMap[u.id] || 0
    }));

    leaderboard.sort((a, b) => b.rap - a.rap);

    // 5. Limit to Top 10
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
  onlineUsers.set(userId, Date.now());
  // Consider user offline if they haven't been active in 5 minutes
  setTimeout(() => {
    const lastSeen = onlineUsers.get(userId);
    if (lastSeen && Date.now() - lastSeen > 5 * 60 * 1000) {
      onlineUsers.delete(userId);
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

          // VALUE: Only use manual item.value
          let itemValue = (itemData.value !== null && itemData.value !== undefined) ? itemData.value : 0;

          // RAP: Only use RAP for Limited items
          let itemRAP = 0;
          if (itemData.is_limited) {
            itemRAP = rapMap.get(userItem.item_id) || itemData.rap || 0;
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

