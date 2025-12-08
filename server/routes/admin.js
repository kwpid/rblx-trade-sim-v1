const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getItemDetails } = require('../utils/rolimons');

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Upload new item
router.post('/items', async (req, res) => {
  try {
    const { roblox_item_id, initial_price, sale_type, stock_count, timer_duration, is_off_sale } = req.body;

    if (!roblox_item_id || !initial_price) {
      return res.status(400).json({ error: 'Roblox item ID and initial price are required' });
    }

    // Fetch item details from Rolimons
    const itemDetails = await getItemDetails(roblox_item_id);

    // Calculate end time if timer
    let sale_end_time = null;
    if (sale_type === 'timer' && timer_duration) {
      sale_end_time = new Date(Date.now() + timer_duration * 60 * 1000); // timer_duration in minutes
    }

    // Create item
    const { data: item, error } = await supabase
      .from('items')
      .insert([
        {
          roblox_item_id,
          name: itemDetails.name,
          description: itemDetails.description,
          image_url: itemDetails.imageUrl,
          initial_price,
          current_price: initial_price,
          sale_type: sale_type || 'stock',
          stock_count: sale_type === 'stock' ? stock_count : null,
          remaining_stock: sale_type === 'stock' ? stock_count : null,
          sale_end_time,
          is_limited: false,
          is_off_sale: is_off_sale || false,
          created_by: req.user.id
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Create initial RAP entry
    await supabase
      .from('item_rap_history')
      .insert([
        {
          item_id: item.id,
          rap_value: initial_price,
          timestamp: new Date().toISOString()
        }
      ]);

    res.json(item);
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// Get all items (including off-sale)
router.get('/items', async (req, res) => {
  try {
    const { data: items, error } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Update item
router.put('/items/:id', async (req, res) => {
  try {
    // Get current item
    const { data: currentItem, error: fetchError } = await supabase
      .from('items')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !currentItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Check if trying to update value when item is not out of stock
    if (req.body.value !== undefined) {
      const isOutOfStock = currentItem.is_off_sale || 
        (currentItem.sale_type === 'stock' && currentItem.remaining_stock <= 0);
      
      if (!isOutOfStock) {
        return res.status(400).json({ error: 'Value can only be updated when item is out of stock' });
      }
    }

    const { data: item, error } = await supabase
      .from('items')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json(item);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// Delete item
router.delete('/items/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;

