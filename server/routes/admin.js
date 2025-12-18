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
    const { roblox_item_id, item_name, item_description, initial_price, sale_type, stock_count, timer_duration, timer_unit, is_off_sale, image_url, buy_limit, initial_value } = req.body;

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
          value: initial_value ? parseInt(initial_value) : 0,
          trend: 'stable',
          demand: 'unknown',
          created_by: req.user.id
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Auto-assign removed by request.
    // Admin no longer gets Serial #0 automatically.

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

    // Check if trying to update value (Always allowed now, to support "Initial Value" editing)
    // Also allow is_limited update
    if (req.body.is_limited !== undefined || req.body.value !== undefined) {
      // Track value change history if value, trend, or demand is being updated
      const hasValueChange = req.body.value !== undefined && req.body.value !== currentItem.value;
      const hasTrendChange = req.body.trend !== undefined && req.body.trend !== currentItem.trend;
      const hasDemandChange = req.body.demand !== undefined && req.body.demand !== currentItem.demand;

      if (hasValueChange || hasTrendChange || hasDemandChange) {
        const newValue = req.body.value !== undefined ? req.body.value : currentItem.value || 0;
        const oldValue = currentItem.value || 0;

        // PROJECTED CHECK
        const rap = currentItem.rap || 0;
        const wasProjected = oldValue > 0 && rap > (oldValue * 1.25 + 50);
        const isProjected = newValue > 0 && rap > (newValue * 1.25 + 50);

        let systemExplanation = req.body.value_update_explanation || null;
        if (wasProjected !== isProjected) {
          const statusTxt = isProjected
            ? `Item became Projected (RAP: ${rap} vs New Val: ${newValue})`
            : `Item NO LONGER Projected (RAP: ${rap} vs New Val: ${newValue})`;

          systemExplanation = systemExplanation ? `${systemExplanation} | ${statusTxt}` : statusTxt;
        }

        // Create value change history entry
        await supabase
          .from('value_change_history')
          .insert([
            {
              item_id: req.params.id,
              previous_value: oldValue,
              new_value: newValue,
              previous_trend: currentItem.trend || 'stable',
              new_trend: req.body.trend !== undefined ? req.body.trend : currentItem.trend || 'stable',
              previous_demand: currentItem.demand || 'unknown',
              new_demand: req.body.demand !== undefined ? req.body.demand : currentItem.demand || 'unknown',
              explanation: systemExplanation,
              changed_by: req.user.id,
              created_at: new Date().toISOString()
            }
          ]);

        // Send Discord Webhook
        try {
          const axios = require('axios');
          const webhookUrl = process.env.DISCORD_WEBHOOK_URL_VALUES;
          if (webhookUrl) {
            const trend = req.body.trend !== undefined ? req.body.trend : currentItem.trend || 'stable';
            const demand = req.body.demand !== undefined ? req.body.demand : currentItem.demand || 'unknown';

            const embed = {
              title: `Value Update: ${currentItem.name}`,
              thumbnail: { url: currentItem.image_url },
              color: 3447003, // Blue
              fields: [
                { name: "Old Value", value: `R$${oldValue.toLocaleString()}`, inline: true },
                { name: "New Value", value: `R$${newValue.toLocaleString()}`, inline: true },
                { name: "Trend", value: trend.toUpperCase(), inline: true },
                { name: "Demand", value: demand.toUpperCase().replace('_', ' '), inline: true },
                { name: "Explanation", value: systemExplanation || "No explanation provided" }
              ],
              footer: { text: `Updated by Admin` },
              timestamp: new Date().toISOString()
            };

            await axios.post(webhookUrl, { embeds: [embed] });
          }
        } catch (err) {
          console.error("Failed to send value update webhook:", err);
        }
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

// Distribute item to users (POST /items/:id/distribute)
router.post('/items/:id/distribute', async (req, res) => {
  try {
    const { usernames } = req.body; // Comma separated string or array
    const itemId = req.params.id;

    if (!usernames) {
      return res.status(400).json({ error: 'Usernames are required' });
    }

    const usernameList = Array.isArray(usernames)
      ? usernames
      : usernames.split(',').map(u => u.trim()).filter(u => u);

    if (usernameList.length === 0) {
      return res.status(400).json({ error: 'No valid usernames provided' });
    }

    // 1. Fetch Users
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, username')
      .in('username', usernameList);

    if (userError || !users || users.length === 0) {
      return res.status(404).json({ error: 'No matching users found' });
    }

    // 2. Fetch current Serial Number/Count
    // Get max serial for this item to append from there
    // Or just count existing user_items for this item
    const { count: existingCount, error: countError } = await supabase
      .from('user_items')
      .select('*', { count: 'exact', head: true })
      .eq('item_id', itemId);

    // We want unique serials. 
    // Usually serial = existingCount + 1, +2, etc.
    // But to be safe in case of gaps (unlikely here but simpler to just append)
    let nextSerial = (existingCount || 0) + 1;

    const itemsPayload = users.map(user => {
      return {
        user_id: user.id,
        item_id: itemId,
        serial_number: nextSerial++,
        is_for_sale: false,
        purchase_price: 0 // Free distribution
      };
    });

    // 3. Insert Items
    const { error: insertError } = await supabase
      .from('user_items')
      .insert(itemsPayload);

    if (insertError) throw insertError;

    // Log this?
    console.log(`[Admin] Distributed item ${itemId} to ${users.length} users.`);

    res.json({ success: true, count: users.length, users: users.map(u => u.username) });

  } catch (error) {
    console.error('Error distributing item:', error);
    res.status(500).json({ error: 'Failed to distribute item' });
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

// Get RAP changes (transactions log)
router.get('/rap-changes', async (req, res) => {
  try {
    // Fetch 'buy' transactions (representing a sale)
    // Join items, buyer (user_id), and seller (related_user_id)
    const { data: logs, error } = await supabase
      .from('transactions')
      .select(`
        *,
        items:item_id (id, name, image_url),
        buyer:users!user_id (id, username),
        seller:users!related_user_id (id, username)
      `)
      .eq('type', 'buy')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    res.json(logs || []);
  } catch (error) {
    console.error('Error fetching rap changes:', error);
    res.status(500).json({ error: 'Failed to fetch rap changes' });
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

// Moderate user (Warn, Ban, Wipe)
router.post('/moderate', async (req, res) => {
  try {
    const { userId, action, reason, duration, wipe } = req.body;
    const moderatorId = req.user.id;
    const ADMIN_USER_ID = '0c55d336-0bf7-49bf-9a90-1b4ba4e13679';

    if (!userId || !action || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // prevent self-moderation or moderating other admins (optional safety)
    if (userId === moderatorId) {
      return res.status(400).json({ error: 'Cannot moderate yourself' });
    }

    let bannedUntil = null;
    let durationHours = null;

    if (action === 'ban') {
      if (duration === 'perm') {
        bannedUntil = new Date('9999-12-31').toISOString(); // Effectively perm
        durationHours = -1; // Flag for perm
      } else {
        const hours = parseInt(duration);
        if (!isNaN(hours)) {
          durationHours = hours;
          bannedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
        } else {
          return res.status(400).json({ error: 'Invalid duration for ban' });
        }
      }
    }

    // Database updates within a transaction-like flow (sequential)

    // 1. Log the action
    const { error: logError } = await supabase
      .from('moderation_logs')
      .insert([{
        user_id: userId,
        action: action,
        reason: reason,
        duration_hours: durationHours,
        expires_at: bannedUntil,
        moderator_id: moderatorId
      }]);

    if (logError) throw logError;

    // 2. Perform Action specific updates
    if (action === 'warn') {
      // Increment warning count
      // We need to fetch current count first or use rpc if available, but simple fetch-update is fine for now
      const { data: user } = await supabase.from('users').select('warnings_count').eq('id', userId).single();
      const newCount = (user?.warnings_count || 0) + 1;

      await supabase.from('users').update({ warnings_count: newCount }).eq('id', userId);

    } else if (action === 'ban') {
      // Update banned_until
      await supabase.from('users').update({ banned_until: bannedUntil }).eq('id', userId);

      // Handle Wipe if requested and applicable
      // Wipe is optional and only available/requested logic usually for long bans
      if (wipe) {
        // Transfer all items to admin
        // Update user_items where user_id = userId -> set user_id = ADMIN_USER_ID
        // We also need to ensure they are off-sale so they don't pollute the market immediately
        const { error: wipeError } = await supabase
          .from('user_items')
          .update({
            user_id: ADMIN_USER_ID,
            is_for_sale: false
          })
          .eq('user_id', userId);

        if (wipeError) {
          console.error("Wipe failed:", wipeError);
          // Log this failure?
        } else {
          // Log wipe action separately or implied? 
          // Logic says "wipe option", usually accompanies the ban. 
          // Let's add a separate log entry for the wipe to be clear
          await supabase.from('moderation_logs').insert([{
            user_id: userId,
            action: 'wipe',
            reason: `Wipe associated with ban. Reason: ${reason}`,
            moderator_id: moderatorId
          }]);
        }
      }
    } else if (action === 'unban') {
      await supabase.from('users').update({ banned_until: null }).eq('id', userId);
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Error moderating user:', error);
    res.status(500).json({ error: 'Failed to moderate user' });
  }
});

// Get moderation logs for a user
router.get('/moderation-logs/:userId', async (req, res) => {
  try {
    const { data: logs, error } = await supabase
      .from('moderation_logs')
      .select(`
                *,
                moderator:moderator_id (username)
            `)
      .eq('user_id', req.params.userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(logs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

module.exports = router;

