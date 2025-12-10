const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { getItemDetails } = require('../utils/rolimons');

// Get all items (catalog)
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const { data: items, error } = await supabase
      .from('items')
      .select('*')
      .eq('is_off_sale', false)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

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

    res.json(itemsWithProjected);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items', details: error.message });
  }
});

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

// Get value change history (public endpoint for all users)
router.get('/value-changes', async (req, res) => {
  try {
    const { data: history, error } = await supabase
      .from('value_change_history')
      .select(`
        *,
        items:item_id (id, name, image_url, roblox_item_id),
        users:changed_by (id, username)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    res.json(history || []);
  } catch (error) {
    console.error('Error fetching value change history:', error);
    res.status(500).json({ error: 'Failed to fetch value change history', details: error.message });
  }
});

// Get RAP change logs
router.get('/rap-changes', async (req, res) => {
  try {
    const { data: logs, error } = await supabase
      .from('rap_change_log')
      .select(`
        *,
        amount:purchase_price,
        items:item_id (id, name, image_url, roblox_item_id)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(logs);
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

    res.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ error: 'Failed to fetch item', details: error.message });
  }
});

module.exports = router;

