const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// Purchase item from marketplace
router.post('/purchase', authenticate, async (req, res) => {
  try {
    const { item_id } = req.body;

    // Get item
    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('*')
      .eq('id', item_id)
      .single();

    if (itemError || !item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Check if item is available
    if (item.is_off_sale) {
      return res.status(400).json({ error: 'Item is not for sale' });
    }

    if (item.is_limited) {
      return res.status(400).json({ error: 'Item is limited and can only be purchased from other players' });
    }

    // Check stock
    if (item.sale_type === 'stock' && item.remaining_stock <= 0) {
      return res.status(400).json({ error: 'Item is out of stock' });
    }

    // Check timer
    if (item.sale_type === 'timer' && new Date(item.sale_end_time) < new Date()) {
      // Item should be limited now
      await supabase
        .from('items')
        .update({ is_limited: true })
        .eq('id', item_id);
      
      return res.status(400).json({ error: 'Item is no longer available' });
    }

    // Check user cash
    const { data: user } = await supabase
      .from('users')
      .select('cash')
      .eq('id', req.user.id)
      .single();

    if (user.cash < item.current_price) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    // Deduct cash
    await supabase
      .from('users')
      .update({ cash: user.cash - item.current_price })
      .eq('id', req.user.id);

    // Add item to user inventory
    const { data: userItem, error: userItemError } = await supabase
      .from('user_items')
      .insert([
        {
          user_id: req.user.id,
          item_id: item.id,
          purchase_price: item.current_price,
          is_for_sale: false
        }
      ])
      .select()
      .single();

    if (userItemError) throw userItemError;

    // Update stock
    if (item.sale_type === 'stock') {
      await supabase
        .from('items')
        .update({ remaining_stock: item.remaining_stock - 1 })
        .eq('id', item_id);
    }

    // Update RAP
    await supabase
      .from('item_rap_history')
      .insert([
        {
          item_id: item.id,
          rap_value: item.current_price,
          timestamp: new Date().toISOString()
        }
      ]);

    res.json({ success: true, userItem });
  } catch (error) {
    console.error('Error purchasing item:', error);
    res.status(500).json({ error: 'Failed to purchase item' });
  }
});

// List item for sale
router.post('/list', authenticate, async (req, res) => {
  try {
    const { user_item_id, sale_price } = req.body;

    if (!sale_price || sale_price <= 0) {
      return res.status(400).json({ error: 'Valid sale price is required' });
    }

    // Get user item
    const { data: userItem, error: userItemError } = await supabase
      .from('user_items')
      .select('*')
      .eq('id', user_item_id)
      .eq('user_id', req.user.id)
      .single();

    if (userItemError || !userItem) {
      return res.status(404).json({ error: 'Item not found in your inventory' });
    }

    // Update user item
    const { data: updatedItem, error: updateError } = await supabase
      .from('user_items')
      .update({
        is_for_sale: true,
        sale_price
      })
      .eq('id', user_item_id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json(updatedItem);
  } catch (error) {
    console.error('Error listing item:', error);
    res.status(500).json({ error: 'Failed to list item' });
  }
});

// Purchase from player
router.post('/purchase-from-player', authenticate, async (req, res) => {
  try {
    const { user_item_id } = req.body;

    // Get user item
    const { data: userItem, error: userItemError } = await supabase
      .from('user_items')
      .select('*, items:item_id (*)')
      .eq('id', user_item_id)
      .eq('is_for_sale', true)
      .single();

    if (userItemError || !userItem) {
      return res.status(404).json({ error: 'Item not available' });
    }

    // Check if trying to buy own item
    if (userItem.user_id === req.user.id) {
      return res.status(400).json({ error: 'Cannot purchase your own item' });
    }

    // Check user cash
    const { data: user } = await supabase
      .from('users')
      .select('cash')
      .eq('id', req.user.id)
      .single();

    if (user.cash < userItem.sale_price) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    // Get seller
    const { data: seller } = await supabase
      .from('users')
      .select('cash')
      .eq('id', userItem.user_id)
      .single();

    // Transfer cash
    await supabase
      .from('users')
      .update({ cash: user.cash - userItem.sale_price })
      .eq('id', req.user.id);

    await supabase
      .from('users')
      .update({ cash: seller.cash + userItem.sale_price })
      .eq('id', userItem.user_id);

    // Transfer item
    await supabase
      .from('user_items')
      .update({
        user_id: req.user.id,
        is_for_sale: false,
        sale_price: null,
        purchase_price: userItem.sale_price
      })
      .eq('id', user_item_id);

    // Update RAP
    await supabase
      .from('item_rap_history')
      .insert([
        {
          item_id: userItem.item_id,
          rap_value: userItem.sale_price,
          timestamp: new Date().toISOString()
        }
      ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error purchasing from player:', error);
    res.status(500).json({ error: 'Failed to purchase item' });
  }
});

module.exports = router;

