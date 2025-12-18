const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { getItemDetails } = require('../utils/rolimons');

// Get all items (catalog)
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, sort = 'newest' } = req.query;

    let query = supabase
      .from('items')
      .select('*')
      .eq('is_off_sale', false);

    // Apply sorting
    switch (sort) {
      case 'price_high':
      case 'price_low':
        // For price sorting, we need to handle resale prices for limited items
        // First, fetch all items without sorting
        query = query.order('created_at', { ascending: false });
        break;
      case 'value_high':
        query = query.order('value', { ascending: false });
        break;
      case 'value_low':
        query = query.order('value', { ascending: true });
        break;
      case 'limiteds':
        query = query.eq('is_limited', true).order('created_at', { ascending: false });
        break;
      case 'in_stock':
        query = query.eq('is_limited', false).order('created_at', { ascending: false });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data: items, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    const itemsWithProjected = (items || []).map(item => {
      // Calculate projected status
      // Logic: If RAP > Value * 1.25 (25% inflated), and Value > 0
      // We add a small buffer (50) to ignore very cheap items fluctuating
      const rap = item.rap || 0;
      const realValue = item.value || 0; // Internal true value
      const isProjected = realValue > 0 && rap > (realValue * 1.25 + 50);

      // Mask value for non-limiteds (Pre-defined value hidden from public)
      const displayValue = item.is_limited ? realValue : 0;

      return {
        ...item,
        value: displayValue, // Override with masked value
        is_projected: isProjected
      };
    });

    // Handle price sorting with resale prices
    if (sort === 'price_low' || sort === 'price_high') {
      // Fetch resale prices for limited/out-of-stock items
      const itemsNeedingResellers = itemsWithProjected.filter(item =>
        item.is_limited || item.is_off_sale || (item.sale_type === 'stock' && item.remaining_stock <= 0)
      );

      const resellerPriceMap = {};

      // Fetch resale prices in parallel
      await Promise.all(itemsNeedingResellers.map(async (item) => {
        const { data: resellers } = await supabase
          .from('user_items')
          .select('sale_price')
          .eq('item_id', item.id)
          .eq('is_for_sale', true)
          .order('sale_price', { ascending: true })
          .limit(1);

        if (resellers && resellers.length > 0) {
          resellerPriceMap[item.id] = resellers[0].sale_price;
        }
      }));

      // Sort by effective price (resale price for limiteds, current_price for others)
      itemsWithProjected.sort((a, b) => {
        const priceA = resellerPriceMap[a.id] || a.current_price || 0;
        const priceB = resellerPriceMap[b.id] || b.current_price || 0;

        return sort === 'price_low' ? priceA - priceB : priceB - priceA;
      });
    }

    res.json(itemsWithProjected);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items', details: error.message });
  }
});
// Get recent limiteds
router.get('/new-limiteds', async (req, res) => {
  try {
    // Fetch limiteds and sort by when they became limited
    // Use created_at as fallback if updated_at is null
    const { data: items, error } = await supabase
      .from('items')
      .select('*')
      .eq('is_limited', true)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Sort by updated_at if available, otherwise use created_at
    const sortedItems = items.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at);
      const dateB = new Date(b.updated_at || b.created_at);
      return dateB - dateA; // Newest first
    });

    res.json(sortedItems);
  } catch (error) {
    console.error('Error fetching new limiteds:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

// Get item RAP history (must come before /:id)
// Get item RAP history (must come before /:id)
router.get('/:id/rap-history', async (req, res) => {
  try {
    const { data: history, error } = await supabase
      .from('item_rap_history')
      .select('*')
      .eq('item_id', req.params.id)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    res.json(history || []);
  } catch (error) {
    console.error('Error fetching RAP history:', error);
    res.status(500).json({ error: 'Failed to fetch RAP history', details: error.message });
  }
});

// Get item resellers (must come before /:id)
router.get('/:id/resellers', async (req, res) => {
  try {
    const { data: resellers, error } = await supabase
      .from('user_items')
      .select(`
        *,
        users (username)
      `)
      .eq('item_id', req.params.id)
      .eq('is_for_sale', true)
      .order('sale_price', { ascending: true });

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    // Add serial number (using row number based on creation order)
    const { data: allUserItems, error: allItemsError } = await supabase
      .from('user_items')
      .select('id, created_at')
      .eq('item_id', req.params.id)
      .order('created_at', { ascending: true });

    if (allItemsError) {
      console.error('Error fetching all user items:', allItemsError);
    }

    const serialMap = new Map();
    if (allUserItems) {
      allUserItems.forEach((item, index) => {
        serialMap.set(item.id, index + 1);
      });
    }

    const resellersWithSerial = (resellers || []).map(reseller => ({
      ...reseller,
      serial_number: serialMap.get(reseller.id) || 0,
      users: reseller.users || { username: 'Unknown' }
    }));

    res.json(resellersWithSerial);
  } catch (error) {
    console.error('Error fetching resellers:', error);
    res.status(500).json({ error: 'Failed to fetch resellers', details: error.message });
  }
});

// Get value change history (public endpoint// Get recent value changes
router.get('/value-changes', async (req, res) => {
  try {
    const { item_id, limit = 50, page = 1 } = req.query;
    const limitNum = parseInt(limit);
    const offset = (parseInt(page) - 1) * limitNum;

    let query = supabase
      .from('item_value_history')
      .select(`
        *,
        items:item_id (
          id,
          name,
          image_url,
          roblox_item_id
        ),
        users:changed_by (
          id,
          username
        )
      `)
      .order('created_at', { ascending: false });

    if (item_id) {
      query = query.eq('item_id', item_id);
    }

    // Apply pagination
    const { data: changes, error, count } = await query
      .range(offset, offset + limitNum - 1);

    if (error) throw error;

    res.json({
      data: changes,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total: count // Note: Supabase count requires extra select option if we wanted total, but range implies it usually? 
        // Actually supabase range doesn't return count unless we ask. 
        // For simple "Load More", we might not need total, but let's try to get it.
        // .select(..., { count: 'estimated' })
      }
    });
  } catch (error) {
    console.error('Error fetching value changes:', error);
    res.status(500).json({ error: 'Failed to fetch value changes' });
  }
});

// Get RAP change logs
router.get('/rap-changes', async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const limitNum = parseInt(limit);
    const offset = (parseInt(page) - 1) * limitNum;

    // Use proper offset and limit
    const { data: logs, error } = await supabase
      .from('rap_change_log')
      .select(`
        *,
        amount:purchase_price,
        items:item_id (id, name, image_url, roblox_item_id)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) throw error;

    // Note: Frontend likely expects array, but for consistency with value-changes 
    // we might want pagination wrapper. However, to avoid breaking changes if frontend kept as is,
    // let's check frontend. Frontend expects array currently.
    // I should return { data: [], pagination: {} } effectively, but frontend needs Update.
    // I'll update frontend next. So I can change response structure here.

    res.json({
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching RAP changes:', error);
    res.status(500).json({ error: 'Failed to fetch RAP changes' });
  }
});

// Get item owners (must come before /:id)
router.get('/:id/owners', async (req, res) => {
  try {
    const { data: owners, error } = await supabase
      .from('user_items')
      .select('id')
      .eq('item_id', req.params.id);

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    // Count total owners
    const ownerCount = owners ? owners.length : 0;

    res.json({ count: ownerCount });
  } catch (error) {
    console.error('Error fetching owners:', error);
    res.status(500).json({ error: 'Failed to fetch owners', details: error.message });
  }
});

// Get single item (must come last)
router.get('/:id', async (req, res) => {
  try {
    const { data: item, error } = await supabase
      .from('items')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) {
      console.error('Supabase error:', error);
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Item not found' });
      }
      throw error;
    }

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Check for expired timer to mark as limited
    if (!item.is_limited && item.sale_type === 'timer' && item.sale_end_time && new Date(item.sale_end_time) < new Date()) {
      await supabase
        .from('items')
        .update({ is_limited: true })
        .eq('id', item.id);
      item.is_limited = true;
    }

    // Calculate projected
    const rap = item.rap || 0;
    const val = item.value || 0;
    // Condition: RAP > Value * 1.25 + 50
    item.is_projected = val > 0 && rap > (val * 1.25 + 50);

    // Mask value for non-limiteds
    if (!item.is_limited) {
      item.value = 0;
    }

    // Calculate Hoarded Stats
    const { count: totalCopies } = await supabase
      .from('user_items')
      .select('*', { count: 'exact', head: true })
      .eq('item_id', item.id);

    const { count: hoardedCopies } = await supabase
      .from('user_items')
      .select(`
            *,
            users!inner(personality)
        `, { count: 'exact', head: true })
      .eq('item_id', item.id)
      .eq('users.personality', 'hoarder');

    item.total_copies = totalCopies || 0;
    item.hoarded_count = hoardedCopies || 0;

    // Calculate Banned Copies (Held by Admin 0c55d336-0bf7-49bf-9a90-1b4ba4e13679)
    const { count: bannedCopies } = await supabase
      .from('user_items')
      .select('*', { count: 'exact', head: true })
      .eq('item_id', item.id)
      .eq('user_id', '0c55d336-0bf7-49bf-9a90-1b4ba4e13679');

    item.banned_copies = bannedCopies || 0;

    res.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ error: 'Failed to fetch item', details: error.message });
  }
});

module.exports = router;

