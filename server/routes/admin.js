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
    const { roblox_item_id, item_name, item_description, initial_price, sale_type, stock_count, timer_duration, is_off_sale, image_url, buy_limit } = req.body;

    if (!roblox_item_id || !initial_price) {
      return res.status(400).json({ error: 'Roblox item ID and initial price are required' });
    }

    // Fetch item details from Rolimons
    const itemDetails = await getItemDetails(roblox_item_id);

    // Use provided image_url or fallback to Roblox thumbnail
    // If image_url is empty string, use Roblox thumbnail
    const finalImageUrl = (image_url && image_url.trim() !== '') ? image_url : itemDetails.imageUrl;

    // Calculate end time if timer
    let sale_end_time = null;
    if (sale_type === 'timer' && timer_duration) {
      sale_end_time = new Date(Date.now() + timer_duration * 60 * 1000); // timer_duration in minutes
    }

    // Use custom name if provided, otherwise use Roblox name
    const finalName = (item_name && item_name.trim() !== '') ? item_name.trim() : itemDetails.name;
    // Use custom description if provided, otherwise use Roblox description
    const finalDescription = (item_description && item_description.trim() !== '') ? item_description.trim() : itemDetails.description;

    // Create item
    const { data: item, error } = await supabase
      .from('items')
      .insert([
        {
          roblox_item_id,
          name: finalName,
          description: finalDescription,
          image_url: finalImageUrl,
          initial_price,
          current_price: initial_price,
          sale_type: sale_type || 'stock',
          stock_count: sale_type === 'stock' ? stock_count : null,
          remaining_stock: sale_type === 'stock' ? stock_count : null,
          sale_end_time,
          is_limited: false,
          is_off_sale: is_off_sale || false,
          buy_limit: buy_limit && buy_limit > 0 ? parseInt(buy_limit) : null,
          value: 0,
          trend: 'stable',
          demand: 'unknown',
          created_by: req.user.id
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Don't create initial RAP entry - RAP is only for reseller purchases

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

      // Track value change history if value, trend, or demand is being updated
      const hasValueChange = req.body.value !== undefined && req.body.value !== currentItem.value;
      const hasTrendChange = req.body.trend !== undefined && req.body.trend !== currentItem.trend;
      const hasDemandChange = req.body.demand !== undefined && req.body.demand !== currentItem.demand;

      if (hasValueChange || hasTrendChange || hasDemandChange) {
        // Create value change history entry
        await supabase
          .from('value_change_history')
          .insert([
            {
              item_id: req.params.id,
              previous_value: currentItem.value || 0,
              new_value: req.body.value !== undefined ? req.body.value : currentItem.value || 0,
              previous_trend: currentItem.trend || 'stable',
              new_trend: req.body.trend !== undefined ? req.body.trend : currentItem.trend || 'stable',
              previous_demand: currentItem.demand || 'unknown',
              new_demand: req.body.demand !== undefined ? req.body.demand : currentItem.demand || 'unknown',
              explanation: req.body.value_update_explanation || null,
              changed_by: req.user.id,
              created_at: new Date().toISOString()
            }
          ]);
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

// Get value change history
router.get('/value-changes', async (req, res) => {
  try {
    const { data: history, error } = await supabase
      .from('value_change_history')
      .select(`
        *,
        items:item_id (id, name),
        users:changed_by (id, username)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    res.json(history || []);
  } catch (error) {
    console.error('Error fetching value change history:', error);
    res.status(500).json({ error: 'Failed to fetch value change history' });
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

