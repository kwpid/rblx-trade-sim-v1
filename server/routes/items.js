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

    res.json(items || []);
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

    res.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ error: 'Failed to fetch item', details: error.message });
  }
});

module.exports = router;

