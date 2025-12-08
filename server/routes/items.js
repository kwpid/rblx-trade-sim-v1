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
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Get single item
router.get('/:id', async (req, res) => {
  try {
    const { data: item, error } = await supabase
      .from('items')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// Get item RAP history
router.get('/:id/rap-history', async (req, res) => {
  try {
    const { data: history, error } = await supabase
      .from('item_rap_history')
      .select('*')
      .eq('item_id', req.params.id)
      .order('timestamp', { ascending: true });

    if (error) throw error;

    res.json(history);
  } catch (error) {
    console.error('Error fetching RAP history:', error);
    res.status(500).json({ error: 'Failed to fetch RAP history' });
  }
});

// Get item resellers
router.get('/:id/resellers', async (req, res) => {
  try {
    const { data: resellers, error } = await supabase
      .from('user_items')
      .select(`
        *,
        users:user_id (username)
      `)
      .eq('item_id', req.params.id)
      .eq('is_for_sale', true)
      .order('sale_price', { ascending: true });

    if (error) throw error;

    res.json(resellers);
  } catch (error) {
    console.error('Error fetching resellers:', error);
    res.status(500).json({ error: 'Failed to fetch resellers' });
  }
});

module.exports = router;

