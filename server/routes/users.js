const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// Get user profile
router.get('/:id', async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, cash, is_admin, created_at')
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
      .limit(100);

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
    // Get all users with their inventories
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username');

    if (usersError) throw usersError;

    const userValues = [];

    for (const user of users) {
      try {
        // Get user's inventory
        const { data: inventory, error: inventoryError } = await supabase
          .from('user_items')
          .select(`
            *,
            items:item_id (*)
          `)
          .eq('user_id', user.id);

        if (inventoryError) continue;

        let totalValue = 0;

        if (inventory && inventory.length > 0) {
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

          inventory.forEach(userItem => {
            const itemData = userItem.items;
            if (!itemData) return;

            const isOutOfStock = itemData.is_off_sale || 
              (itemData.sale_type === 'stock' && itemData.remaining_stock <= 0);
            
            let itemValue = itemData.value || itemData.current_price || userItem.purchase_price || 0;
            
            if ((itemData.is_limited || isOutOfStock) && resellerPriceMap.has(userItem.item_id)) {
              itemValue = resellerPriceMap.get(userItem.item_id);
            }
            
            totalValue += itemValue;
          });
        }

        userValues.push({
          id: user.id,
          username: user.username,
          value: totalValue
        });
      } catch (error) {
        console.error(`Error calculating value for user ${user.id}:`, error);
      }
    }

    // Sort by value descending and limit to top 100
    userValues.sort((a, b) => b.value - a.value);
    res.json(userValues.slice(0, 100));
  } catch (error) {
    console.error('Error fetching value leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch value leaderboard' });
  }
});

// Get leaderboard by RAP
router.get('/leaderboard/rap', async (req, res) => {
  try {
    // Get all users with their inventories
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username');

    if (usersError) throw usersError;

    const userRAPs = [];

    for (const user of users) {
      try {
        // Get user's inventory
        const { data: inventory, error: inventoryError } = await supabase
          .from('user_items')
          .select(`
            *,
            items:item_id (*)
          `)
          .eq('user_id', user.id);

        if (inventoryError) continue;

        let totalRAP = 0;

        if (inventory && inventory.length > 0) {
          // Get RAP history for all items
          const itemIds = inventory.map(item => item.item_id);
          const rapPromises = itemIds.map(async (itemId) => {
            try {
              const { data: rapHistory } = await supabase
                .from('item_rap_history')
                .select('rap_value')
                .eq('item_id', itemId)
                .order('timestamp', { ascending: false })
                .limit(1);
              
              if (rapHistory && rapHistory.length > 0) {
                return { itemId, rap: rapHistory[0].rap_value };
              }
              return { itemId, rap: null };
            } catch (e) {
              return { itemId, rap: null };
            }
          });

          const rapResults = await Promise.all(rapPromises);
          const rapMap = new Map();
          rapResults.forEach(({ itemId, rap }) => {
            if (rap !== null) {
              rapMap.set(itemId, rap);
            }
          });

          inventory.forEach(userItem => {
            const itemData = userItem.items;
            if (!itemData) return;

            const itemRAP = rapMap.get(userItem.item_id) || itemData.current_price || userItem.purchase_price || 0;
            totalRAP += itemRAP;
          });
        }

        userRAPs.push({
          id: user.id,
          username: user.username,
          rap: totalRAP
        });
      } catch (error) {
        console.error(`Error calculating RAP for user ${user.id}:`, error);
      }
    }

    // Sort by RAP descending and limit to top 100
    userRAPs.sort((a, b) => b.rap - a.rap);
    res.json(userRAPs.slice(0, 100));
  } catch (error) {
    console.error('Error fetching RAP leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch RAP leaderboard' });
  }
});

// Get all players
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, cash, created_at')
      .order('cash', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json(users);
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

