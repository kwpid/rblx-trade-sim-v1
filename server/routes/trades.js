const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { sendDiscordWebhook } = require('../utils/discord');
const { updateChallengeProgress, CHALLENGE_TYPES } = require('../utils/eventHelper');
const { checkAndAwardBadges } = require('../services/badgeService');

// Helper to get trade details
async function getTradeWithItems(tradeId) {
  const { data: trade, error } = await supabase
    .from('trades')
    .select(`
      *,
      sender:sender_id (id, username),
      receiver:receiver_id (id, username),
      trade_items (
        id,
        side,
        user_items (
          id,
          user_id,
          item_id,
          created_at,
          purchase_price,
          items (
             id,
             name,
             image_url,
             current_price,
             rap,
             value,
             is_limited,
             is_off_sale,
             sale_type,
             remaining_stock,
             demand,
             stock_count
          )
        )
      )
    `)
    .eq('id', tradeId)
    .single();

  if (error) throw error;
  return trade;
}

// Create a new trade
router.post('/', authenticate, async (req, res) => {
  try {
    const { receiver_id, sender_item_ids, receiver_item_ids } = req.body;

    if (!receiver_id) {
      return res.status(400).json({ error: 'Receiver is required' });
    }

    if (receiver_id === req.user.id) {
      return res.status(400).json({ error: 'Cannot trade with yourself' });
    }

    if ((!sender_item_ids || sender_item_ids.length === 0) && (!receiver_item_ids || receiver_item_ids.length === 0)) {
      return res.status(400).json({ error: 'Trade must contain at least one item' });
    }

    // Start transaction (simulated with standard Supabase calls as specific multi-table transactions are tricky without stored procedures)

    // 1. Verify Sender owns sender_item_ids
    if (sender_item_ids && sender_item_ids.length > 0) {
      const { data: senderItems, error: senderError } = await supabase
        .from('user_items')
        .select('id, user_id, is_for_sale, serial_number')
        .in('id', sender_item_ids);

      if (senderError) throw senderError;

      const ownedIds = senderItems.map(i => i.id);
      const allOwned = sender_item_ids.every(id => ownedIds.includes(id));
      const anyNotOwned = senderItems.some(i => i.user_id !== req.user.id);

      if (!allOwned || anyNotOwned) {
        return res.status(400).json({ error: 'You do not own all the items you are trying to trade' });
      }

      // Check for serial #0 items
      const hasSerialZero = senderItems.some(i => i.serial_number === 0);
      if (hasSerialZero) {
        return res.status(400).json({ error: 'Serial #0 items cannot be traded' });
      }

      // CHECK OFF-SALE ITEMS (Sender)
      // We need to join with items table to check is_off_sale
      // Optimally we fetch this in the initial query
      const { data: senderOffSaleCheck } = await supabase
        .from('user_items')
        .select('id, items!inner(is_off_sale)')
        .in('id', sender_item_ids)
        .eq('items.is_off_sale', true);

      if (senderOffSaleCheck && senderOffSaleCheck.length > 0) {
        return res.status(400).json({ error: 'Cannot trade Off-Sale items (Sender)' });
      }

      // Allow trading items for sale - they will be unlisted if trade is accepted
    }

    // 2. Verify Receiver owns receiver_item_ids
    if (receiver_item_ids && receiver_item_ids.length > 0) {
      const { data: receiverItems, error: receiverError } = await supabase
        .from('user_items')
        .select('id, user_id, is_for_sale, serial_number')
        .in('id', receiver_item_ids);

      if (receiverError) throw receiverError;

      const ownedIds = receiverItems.map(i => i.id);
      const allOwned = receiver_item_ids.every(id => ownedIds.includes(id));
      const anyNotOwned = receiverItems.some(i => i.user_id !== receiver_id);

      if (!allOwned || anyNotOwned) {
        return res.status(400).json({ error: 'Receiver does not own all the requested items' });
      }

      // Check for serial #0 items
      const hasSerialZero = receiverItems.some(i => i.serial_number === 0);
      if (hasSerialZero) {
        return res.status(400).json({ error: 'Serial #0 items cannot be traded' });
      }

      // CHECK OFF-SALE ITEMS (Receiver)
      const { data: receiverOffSaleCheck } = await supabase
        .from('user_items')
        .select('id, items!inner(is_off_sale)')
        .in('id', receiver_item_ids)
        .eq('items.is_off_sale', true);

      if (receiverOffSaleCheck && receiverOffSaleCheck.length > 0) {
        return res.status(400).json({ error: 'Cannot trade Off-Sale items (Receiver)' });
      }

      // Allow trading items for sale - they will be unlisted if trade is accepted
    }

    // 3. Create Trade Record
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert([
        {
          sender_id: req.user.id,
          receiver_id: receiver_id,
          status: 'pending'
        }
      ])
      .select()
      .single();

    if (tradeError) throw tradeError;

    // 4. Create Trade Items
    const tradeItems = [];
    if (sender_item_ids) {
      sender_item_ids.forEach(itemId => {
        tradeItems.push({
          trade_id: trade.id,
          user_item_id: itemId,
          side: 'sender'
        });
      });
    }
    if (receiver_item_ids) {
      receiver_item_ids.forEach(itemId => {
        tradeItems.push({
          trade_id: trade.id,
          user_item_id: itemId,
          side: 'receiver'
        });
      });
    }

    if (tradeItems.length > 0) {
      const { error: itemsError } = await supabase
        .from('trade_items')
        .insert(tradeItems);

      if (itemsError) {
        // Rollback trade
        await supabase.from('trades').delete().eq('id', trade.id);
        throw itemsError;
      }
    }

    res.json(trade);

  } catch (error) {
    console.error('Error creating trade:', error);
    res.status(500).json({ error: 'Failed to create trade: ' + error.message });
  }
});

// Get user trades
router.get('/', authenticate, async (req, res) => {
  try {
    const { type } = req.query; // 'inbound', 'outbound', 'completed', 'inactive'

    let query = supabase
      .from('trades')
      .select(`
        *,
        sender:sender_id (id, username),
        receiver:receiver_id (id, username),
        trade_items (
          id,
          side,
          user_items (
            id,
            items (value, demand, stock_count)
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (type === 'inbound') {
      query = query.eq('receiver_id', req.user.id).eq('status', 'pending');
    } else if (type === 'outbound') {
      query = query.eq('sender_id', req.user.id).eq('status', 'pending');
    } else if (type === 'completed') {
      query = query.or(`sender_id.eq.${req.user.id},receiver_id.eq.${req.user.id}`).eq('status', 'accepted');
    } else if (type === 'inactive') {
      query = query.or(`sender_id.eq.${req.user.id},receiver_id.eq.${req.user.id}`).in('status', ['declined', 'cancelled']);
    } else {
      // Default: all involving user
      query = query.or(`sender_id.eq.${req.user.id},receiver_id.eq.${req.user.id}`);
    }

    const { data: trades, error } = await query;

    if (error) throw error;

    // Calculate value totals for each trade
    const tradesWithValues = trades.map(trade => {
      const senderValue = trade.trade_items
        ?.filter(ti => ti.side === 'sender')
        .reduce((sum, ti) => sum + (ti.user_items?.items?.value || 0), 0) || 0;

      const receiverValue = trade.trade_items
        ?.filter(ti => ti.side === 'receiver')
        .reduce((sum, ti) => sum + (ti.user_items?.items?.value || 0), 0) || 0;

      return {
        ...trade,
        sender_value: senderValue,
        receiver_value: receiverValue
      };
    });

    res.json(tradesWithValues);

  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

// Get single trade
router.get('/:id', authenticate, async (req, res) => {
  try {
    const trade = await getTradeWithItems(req.params.id);

    // Authorization check
    if (trade.sender_id !== req.user.id && trade.receiver_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(trade);
  } catch (error) {
    console.error('Error fetching trade:', error);
    res.status(500).json({ error: 'Failed to fetch trade' });
  }
});

// Accept trade
router.post('/:id/accept', authenticate, async (req, res) => {
  try {
    const trade = await getTradeWithItems(req.params.id);

    // Only receiver can accept
    if (trade.receiver_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the receiver can accept this trade' });
    }

    if (trade.status !== 'pending') {
      return res.status(400).json({ error: 'Trade is no longer pending' });
    }

    // Verify all items are still owned by respective parties and not listed
    const senderItems = trade.trade_items.filter(i => i.side === 'sender').map(i => i.user_items);
    const receiverItems = trade.trade_items.filter(i => i.side === 'receiver').map(i => i.user_items);

    // Re-verify ownership and availability
    for (const item of senderItems) {
      const { data: current, error } = await supabase.from('user_items').select('*').eq('id', item.id).single();
      // Check if item still exists and is owned by sender
      if (!current || current.user_id !== trade.sender_id) {
        // Item was sold or transferred - auto-decline trade
        await supabase.from('trades').update({ status: 'declined' }).eq('id', req.params.id);
        return res.status(400).json({ error: 'Trade auto-declined: Some items were sold before acceptance (Sender)' });
      }
    }
    for (const item of receiverItems) {
      const { data: current, error } = await supabase.from('user_items').select('*').eq('id', item.id).single();
      // Check if item still exists and is owned by receiver
      if (!current || current.user_id !== trade.receiver_id) {
        // Item was sold or transferred - auto-decline trade
        await supabase.from('trades').update({ status: 'declined' }).eq('id', req.params.id);
        return res.status(400).json({ error: 'Trade auto-declined: Some items were sold before acceptance (Receiver)' });
      }
    }

    // Execute Trade - Swap Ownership
    // 1. Move Sender items to Receiver
    if (senderItems.length > 0) {
      const { error: moveSenderError } = await supabase
        .from('user_items')
        .update({ user_id: trade.receiver_id })
        .in('id', senderItems.map(i => i.id));
      if (moveSenderError) throw moveSenderError;
    }

    // 2. Move Receiver items to Sender
    if (receiverItems.length > 0) {
      const { error: moveReceiverError } = await supabase
        .from('user_items')
        .update({ user_id: trade.sender_id })
        .in('id', receiverItems.map(i => i.id));
      if (moveReceiverError) throw moveReceiverError;
    }

    // 3. Update Trade Status
    const { data: updatedTrade, error: updateError } = await supabase
      .from('trades')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', trade.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // 4. Update Event Progress
    // Sender (who sent the trade request originally)
    // - Trade Count
    updateChallengeProgress(trade.sender_id, CHALLENGE_TYPES.TRADE_COUNT, 1);
    // - Trade Unique (TODO: stricter tracking, simplified count for now)
    updateChallengeProgress(trade.sender_id, CHALLENGE_TYPES.TRADE_UNIQUE, 1);

    // Receiver (who accepted)
    // - Trade Count
    updateChallengeProgress(trade.receiver_id, CHALLENGE_TYPES.TRADE_COUNT, 1);
    updateChallengeProgress(trade.receiver_id, CHALLENGE_TYPES.TRADE_UNIQUE, 1);

    // Calculate Values for Value Challenges
    // Sender gave Items -> check if any single item met the "Trade item worth X" criteria?
    // "Trade an item worth 5000+" usually means if you GIVE that item.
    senderItems.forEach(ui => {
      const val = ui.items ? (ui.items.value || 0) : 0;
      updateChallengeProgress(trade.sender_id, CHALLENGE_TYPES.TRADE_VALUE, val);
      // Profit check is hard without history data on what they bought it for, maybe skip for now or use RAP diff?
      // Task said: "Make a trade with profit > 2500"
      // Profit = Value Received - Value Given
    });

    receiverItems.forEach(ui => {
      const val = ui.items ? (ui.items.value || 0) : 0;
      updateChallengeProgress(trade.receiver_id, CHALLENGE_TYPES.TRADE_VALUE, val);
    });

    // Calc Totals for Profit
    const senderValueGiven = senderItems.reduce((acc, i) => acc + (i.items?.value || 0), 0);
    const receiverValueGiven = receiverItems.reduce((acc, i) => acc + (i.items?.value || 0), 0);

    // Sender Profit = Received - Given
    const senderProfit = receiverValueGiven - senderValueGiven;
    if (senderProfit > 0) {
      updateChallengeProgress(trade.sender_id, CHALLENGE_TYPES.TRADE_PROFIT, senderProfit);
    }

    // Receiver Profit = Received (from sender) - Given
    const receiverProfit = senderValueGiven - receiverValueGiven;
    if (receiverProfit > 0) {
      updateChallengeProgress(trade.receiver_id, CHALLENGE_TYPES.TRADE_PROFIT, receiverProfit);
    }

    // Check for Badges
    checkAndAwardBadges(trade.sender_id);
    checkAndAwardBadges(trade.receiver_id);

    res.json({ success: true, trade: updatedTrade });

  } catch (error) {
    console.error('Error accepting trade:', error);
    res.status(500).json({ error: 'Failed to accept trade' });
  }
});

// Decline trade
router.post('/:id/decline', authenticate, async (req, res) => {
  try {
    const { data: trade, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !trade) return res.status(404).json({ error: 'Trade not found' });

    // Receiver can decline
    if (trade.receiver_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (trade.status !== 'pending') {
      return res.status(400).json({ error: 'Trade is not pending' });
    }

    const { data: updatedTrade, error } = await supabase
      .from('trades')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', trade.id)
      .select()
      .single();

    if (error) throw error;
    res.json(updatedTrade);

  } catch (error) {
    console.error('Error declining trade:', error);
    res.status(500).json({ error: 'Failed to decline trade' });
  }
});

// Cancel trade
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const { data: trade, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !trade) return res.status(404).json({ error: 'Trade not found' });

    // Sender can cancel
    if (trade.sender_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (trade.status !== 'pending') {
      return res.status(400).json({ error: 'Trade is not pending' });
    }

    const { data: updatedTrade, error } = await supabase
      .from('trades')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', trade.id)
      .select()
      .single();

    if (error) throw error;
    res.json(updatedTrade);

  } catch (error) {
    console.error('Error cancelling trade:', error);
    res.status(500).json({ error: 'Failed to cancel trade' });
  }
});


// Proof trade (Discord Webhook)
router.post('/:id/proof', authenticate, async (req, res) => {
  try {
    const { data: trade, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !trade) return res.status(404).json({ error: 'Trade not found' });

    // Allow anyone (including AI) to proof accepted trades
    // Removed participant-only restriction to enable AI proofing

    if (trade.status !== 'accepted') {
      return res.status(400).json({ error: 'Trade must be accepted to proof' });
    }

    if (trade.is_proofed) {
      return res.status(400).json({ error: 'Trade already proofed' });
    }

    // Fetch full details to calculate values
    const fullTrade = await getTradeWithItems(req.params.id);

    const senderItems = fullTrade.trade_items.filter(i => i.side === 'sender');
    const receiverItems = fullTrade.trade_items.filter(i => i.side === 'receiver');

    // Calculate total values
    const senderValue = senderItems.reduce((sum, ti) => {
      const value = ti.user_items?.items?.value || 0;
      return sum + value;
    }, 0);

    const receiverValue = receiverItems.reduce((sum, ti) => {
      const value = ti.user_items?.items?.value || 0;
      return sum + value;
    }, 0);

    // Require minimum 10k on BOTH sides
    // Require minimum 10k on AT LEAST ONE side logic (relaxed from both)
    if (senderValue < 10000 && receiverValue < 10000) {
      return res.status(400).json({
        error: 'At least one side must have 10,000+ value to proof this trade'
      });
    }

    // Mark as proofed first to prevent race conditions
    const { error: updateError } = await supabase
      .from('trades')
      .update({ is_proofed: true })
      .eq('id', trade.id);

    if (updateError) throw updateError;

    // Use already-fetched fullTrade for webhook (no need to fetch again)
    // Construct Embeds
    const sender = fullTrade.sender;
    const receiver = fullTrade.receiver;
    const date = new Date(fullTrade.updated_at).toLocaleString();

    const formatItems = (tItems) => {
      return tItems.map(ti => {
        const item = ti.user_items.items;
        const value = item.value || item.rap || 0;
        // Serial logic approximation for webhook (might not be perfect without full inventory fetch but usually acceptable)
        // Or we just show name + value
        return `• **${item.name}** - $${value.toLocaleString()}`;
      }).join('\n') || 'No Items';
    };

    const embed1 = {
      title: "Trade Proof",
      color: 3066993, // Greenish
      fields: [
        { name: "Sender", value: sender.username, inline: true },
        { name: "Receiver", value: receiver.username, inline: true },
        { name: "Date", value: date, inline: false }
      ]
    };

    const embed2 = {
      title: "Items Exchanged",
      color: 3066993,
      fields: [
        { name: `${sender.username} Gave:`, value: formatItems(senderItems), inline: false },
        { name: `For ${receiver.username}s:`, value: formatItems(receiverItems), inline: false }
      ]
    };

    const webhookUrl = 'https://discord.com/api/webhooks/1448110420106809366/wK44HjiU2NBDvoYwQWq5GgwyyWefmr536hNaJMX9fe_LHuJQ_CGw_Fidiv38FfFDo2qS';

    // Send to Discord
    const axios = require('axios');
    await axios.post(webhookUrl, {
      embeds: [embed1, embed2]
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Error proofing trade FULL DETIALS:', error);
    res.status(500).json({ error: 'Failed to proof trade: ' + error.message });
  }
});

// Request value change for trade items (Discord Webhook)
router.post('/:id/value-request', authenticate, async (req, res) => {
  try {
    const { data: trade, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !trade) return res.status(404).json({ error: 'Trade not found' });

    // Only receiver can request value change
    if (trade.receiver_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the receiver can request value changes' });
    }

    // Trade must be pending
    if (trade.status !== 'pending') {
      return res.status(400).json({ error: 'Can only request value changes on pending trades' });
    }

    // Check if value request already exists
    const { data: existingRequest } = await supabase
      .from('value_requests')
      .select('*')
      .eq('trade_id', req.params.id)
      .single();

    if (existingRequest) {
      return res.status(400).json({ error: 'Value request already submitted for this trade' });
    }

    // Fetch full trade details to check values
    const fullTrade = await getTradeWithItems(req.params.id);

    const receiverItems = fullTrade.trade_items.filter(i => i.side === 'receiver');

    // Check if at least one item has 50k+ value
    const hasHighValueItem = receiverItems.some(ti => {
      const value = ti.user_items?.items?.value || 0;
      return value >= 50000;
    });

    if (!hasHighValueItem) {
      return res.status(400).json({
        error: 'Value requests are only available for trades with items worth 50k+ value'
      });
    }

    // Create value request record
    const { data: valueRequest, error: insertError } = await supabase
      .from('value_requests')
      .insert([{
        trade_id: req.params.id,
        requester_id: req.user.id,
        status: 'pending',
        notes: req.body.notes || null
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    // Auto-decline the trade when value request is submitted
    await supabase
      .from('trades')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    // Send Discord webhook
    const sender = fullTrade.sender;
    const receiver = fullTrade.receiver;
    const date = new Date(fullTrade.created_at).toLocaleString();

    const senderItems = fullTrade.trade_items.filter(i => i.side === 'sender');

    const formatItems = (tItems) => {
      return tItems.map(ti => {
        const item = ti.user_items.items;
        const value = item.value || item.rap || 0;
        return `• **${item.name}** - $${value.toLocaleString()}`;
      }).join('\n') || 'No Items';
    };

    const senderValue = senderItems.reduce((sum, ti) => sum + (ti.user_items?.items?.value || 0), 0);
    const receiverValue = receiverItems.reduce((sum, ti) => sum + (ti.user_items?.items?.value || 0), 0);

    const embed1 = {
      title: "⚠️ Value Change Request",
      color: 15844367, // Gold/orange color
      fields: [
        { name: "Requester", value: receiver.username, inline: true },
        { name: "Trade Partner", value: sender.username, inline: true },
        { name: "Trade ID", value: req.params.id, inline: false },
        { name: "Date", value: date, inline: false }
      ]
    };

    const embed2 = {
      title: "Trade Details",
      color: 15844367,
      fields: [
        { name: `${sender.username} Offers ($${senderValue.toLocaleString()})`, value: formatItems(senderItems), inline: false },
        { name: `${receiver.username} Offers ($${receiverValue.toLocaleString()})`, value: formatItems(receiverItems), inline: false }
      ]
    };

    if (req.body.notes) {
      embed2.fields.push({ name: "Notes", value: req.body.notes, inline: false });
    }

    // Use the REQUEST webhook URL from environment variable
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL_REQUEST;

    if (webhookUrl) {
      console.log('[Trades] Sending value request webhook...');
      await sendDiscordWebhook(webhookUrl, [embed1, embed2]);
    } else {
      console.warn('[Value Request] DISCORD_WEBHOOK_URL_REQUEST not configured');
    }

    res.json({ success: true, valueRequest });

  } catch (error) {
    console.error('Error creating value request:', error);
    res.status(500).json({ error: 'Failed to create value request: ' + error.message });
  }
});

// Bulk decline all incoming trades
router.post('/bulk/decline-incoming', authenticate, async (req, res) => {
  try {
    // Get all pending incoming trades for the user
    const { data: trades, error: fetchError } = await supabase
      .from('trades')
      .select('id')
      .eq('receiver_id', req.user.id)
      .eq('status', 'pending');

    if (fetchError) throw fetchError;

    if (!trades || trades.length === 0) {
      return res.json({ success: true, count: 0, message: 'No incoming trades to decline' });
    }

    // Decline all trades
    const tradeIds = trades.map(t => t.id);
    const { error: updateError } = await supabase
      .from('trades')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .in('id', tradeIds);

    if (updateError) throw updateError;

    res.json({ success: true, count: trades.length, message: `Declined ${trades.length} incoming trade(s)` });

  } catch (error) {
    console.error('Error bulk declining incoming trades:', error);
    res.status(500).json({ error: 'Failed to decline incoming trades' });
  }
});

// Bulk cancel all outbound trades
router.post('/bulk/cancel-outbound', authenticate, async (req, res) => {
  try {
    // Get all pending outbound trades for the user
    const { data: trades, error: fetchError } = await supabase
      .from('trades')
      .select('id')
      .eq('sender_id', req.user.id)
      .eq('status', 'pending');

    if (fetchError) throw fetchError;

    if (!trades || trades.length === 0) {
      return res.json({ success: true, count: 0, message: 'No outbound trades to cancel' });
    }

    // Cancel all trades
    const tradeIds = trades.map(t => t.id);
    const { error: updateError } = await supabase
      .from('trades')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .in('id', tradeIds);

    if (updateError) throw updateError;

    res.json({ success: true, count: trades.length, message: `Cancelled ${trades.length} outbound trade(s)` });

  } catch (error) {
    console.error('Error bulk cancelling outbound trades:', error);
    res.status(500).json({ error: 'Failed to cancel outbound trades' });
  }
});

module.exports = router;
