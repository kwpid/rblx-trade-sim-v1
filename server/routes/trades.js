const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// Create trade offer
router.post('/', authenticate, async (req, res) => {
  try {
    const { recipient_id, offered_items, requested_items, offered_cash, requested_cash } = req.body;

    if (!recipient_id) {
      return res.status(400).json({ error: 'Recipient is required' });
    }

    // Create trade
    const { data: trade, error } = await supabase
      .from('trades')
      .insert([
        {
          sender_id: req.user.id,
          recipient_id,
          offered_items: offered_items || [],
          requested_items: requested_items || [],
          offered_cash: offered_cash || 0,
          requested_cash: requested_cash || 0,
          status: 'pending'
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Create notification for recipient
    await supabase
      .from('notifications')
      .insert([
        {
          user_id: recipient_id,
          type: 'trade_offer',
          message: `${req.user.username} sent you a trade offer`,
          data: { trade_id: trade.id }
        }
      ]);

    res.json(trade);
  } catch (error) {
    console.error('Error creating trade:', error);
    res.status(500).json({ error: 'Failed to create trade' });
  }
});

// Get user trades
router.get('/', authenticate, async (req, res) => {
  try {
    const { data: trades, error } = await supabase
      .from('trades')
      .select(`
        *,
        sender:sender_id (id, username),
        recipient:recipient_id (id, username)
      `)
      .or(`sender_id.eq.${req.user.id},recipient_id.eq.${req.user.id}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(trades);
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

// Accept trade
router.post('/:id/accept', authenticate, async (req, res) => {
  try {
    // Get trade
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (tradeError || !trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    if (trade.recipient_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to accept this trade' });
    }

    if (trade.status !== 'pending') {
      return res.status(400).json({ error: 'Trade is not pending' });
    }

    // Verify items exist and belong to users
    // Transfer items and cash
    // (Implementation details...)

    // Update trade status
    await supabase
      .from('trades')
      .update({ status: 'accepted', completed_at: new Date() })
      .eq('id', req.params.id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error accepting trade:', error);
    res.status(500).json({ error: 'Failed to accept trade' });
  }
});

// Decline trade
router.post('/:id/decline', authenticate, async (req, res) => {
  try {
    const { data: trade } = await supabase
      .from('trades')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (!trade || trade.recipient_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await supabase
      .from('trades')
      .update({ status: 'declined' })
      .eq('id', req.params.id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error declining trade:', error);
    res.status(500).json({ error: 'Failed to decline trade' });
  }
});

module.exports = router;

