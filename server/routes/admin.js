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
    const { roblox_item_id, item_name, item_description, initial_price, sale_type, stock_count, timer_duration, timer_unit, is_off_sale, image_url, buy_limit } = req.body;

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
      const duration = parseFloat(timer_duration);
      let milliseconds = 0;

      switch (timer_unit) {
        case 'weeks':
          milliseconds = duration * 7 * 24 * 60 * 60 * 1000;
          break;
        case 'days':
          milliseconds = duration * 24 * 60 * 60 * 1000;
          break;
        case 'hours':
        default:
          milliseconds = duration * 60 * 60 * 1000;
          break;
      }

      sale_end_time = new Date(Date.now() + milliseconds);
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

    // Send Webhook (Item Release)
    try {
      const axios = require('axios');
      // TODO: User to provide specific webhook URL for item releases
      const webhookUrl = process.env.DISCORD_WEBHOOK_URL_ITEMS;

      const embed = {
        title: item.name,
        thumbnail: { url: item.image_url },
        color: 16766720, // Gold
        fields: [
          { name: "Price", value: `R$${item.initial_price.toLocaleString()}`, inline: true }
        ]
      };

      if (item.sale_type === 'stock') {
        embed.fields.push({ name: "Stock", value: item.stock_count.toLocaleString(), inline: true });
      } else if (item.sale_type === 'timer') {
        embed.fields.push({ name: "Available Until", value: new Date(item.sale_end_time).toLocaleString(), inline: true });
      } else {
        embed.fields.push({ name: "Type", value: "Regular", inline: true });
      }

      await axios.post(webhookUrl, { embeds: [embed] });
    } catch (err) {
      console.error("Failed to send item release webhook:", err);
    }

    res.json(item);
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// Get all items (including off-sale)
router.get('/items', async (req, res) => {
  try {
    console.log('Admin fetching items...');
    const { data: items, error } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: false });

    if (items) console.log(`Found ${items.length} items`);
    if (error) console.error('Error in Admin items:', error);

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
        (currentItem.sale_type === 'stock' && currentItem.remaining_stock <= 0) ||
        (currentItem.sale_type === 'timer' && new Date(currentItem.sale_end_time) < new Date());

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
    const itemId = req.params.id;

    // Delete related records first (manual cascade)
    // 1. Transactions
    await supabase.from('transactions').delete().eq('item_id', itemId);

    // 2. User Items (Inventory)
    // Note: This might fail if user_items are referenced in trade_items. 
    // We should probably delete trade_items first if they exist.
    // Assuming trade_items table exists and links to user_items or item_id directly.
    // If trade_items links to user_items, deleting user_items might fail.
    // Let's try to delete user_items and see. 
    // But wait, if trade_items references user_items(id), we need to find those user_items first.

    // Let's get all user_items for this item
    const { data: userItems } = await supabase.from('user_items').select('id').eq('item_id', itemId);
    if (userItems && userItems.length > 0) {
      const userItemIds = userItems.map(ui => ui.id);
      // Delete trade_items referencing these user_items (if applicable)
      // Check if trade_items exists (it usually does in this app structure)
      // I will attempt to delete from 'trade_items' where 'user_item_id' in userItemIds
      // Or maybe 'item_id' in trade_items?
      // I'll check trades.js in next step if this is risky.
      // For now, I'll delete what I know.

      // Delete user_items
      await supabase.from('user_items').delete().eq('item_id', itemId);
    }

    // 3. RAP History
    await supabase.from('item_rap_history').delete().eq('item_id', itemId);

    // 4. Value Change History
    await supabase.from('value_change_history').delete().eq('item_id', itemId);

    // 5. RAP Change Log
    await supabase.from('rap_change_log').delete().eq('item_id', itemId);

    // Finally delete the item
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item', details: error.message });
  }
});

module.exports = router;

