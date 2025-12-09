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

    // Check buy limit (only applies to original price purchases, not limited items)
    if (item.buy_limit && item.buy_limit > 0 && !item.is_limited) {
      // Count how many of this item the user already owns (purchased at original price)
      const { data: userItems, error: countError } = await supabase
        .from('user_items')
        .select('id')
        .eq('user_id', req.user.id)
        .eq('item_id', item.id);

      if (countError) {
        console.error('Error checking buy limit:', countError);
      } else {
        const ownedCount = userItems?.length || 0;
        if (ownedCount >= item.buy_limit) {
          return res.status(400).json({ 
            error: `Buy limit reached. You can only purchase ${item.buy_limit} copy/copies of this item at the original price.` 
          });
        }
      }
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
      const newStock = item.remaining_stock - 1;
      const updateData = { remaining_stock: newStock };
      
      // If stock runs out, mark as limited
      if (newStock <= 0) {
        updateData.is_limited = true;
      }
      
      await supabase
        .from('items')
        .update(updateData)
        .eq('id', item_id);
    }

    // Don't update RAP for original stock purchases - RAP is only for reseller purchases
    // RAP will be updated when items are purchased from other players (resellers)

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

    // If sale_price is null, unlist the item
    if (sale_price === null) {
      const { data: userItem, error: userItemError } = await supabase
        .from('user_items')
        .select('*')
        .eq('id', user_item_id)
        .eq('user_id', req.user.id)
        .single();

      if (userItemError || !userItem) {
        return res.status(404).json({ error: 'Item not found in your inventory' });
      }

      const { data: updatedItem, error: updateError } = await supabase
        .from('user_items')
        .update({
          is_for_sale: false,
          sale_price: null
        })
        .eq('id', user_item_id)
        .select()
        .single();

      if (updateError) throw updateError;

      return res.json(updatedItem);
    }

    if (!sale_price || sale_price <= 0) {
      return res.status(400).json({ error: 'Valid sale price is required' });
    }

    // Get user item with item details
    const { data: userItem, error: userItemError } = await supabase
      .from('user_items')
      .select(`
        *,
        items:item_id (*)
      `)
      .eq('id', user_item_id)
      .eq('user_id', req.user.id)
      .single();

    if (userItemError || !userItem) {
      return res.status(404).json({ error: 'Item not found in your inventory' });
    }

    // Only allow selling limited items
    const itemData = userItem.items;
    if (!itemData || !itemData.is_limited) {
      return res.status(400).json({ error: 'You can only sell limited items' });
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

    // Prevent purchasing own items
    if (userItem.user_id === req.user.id) {
      return res.status(400).json({ error: 'You cannot purchase your own item' });
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

    // Calculate fees: 80% to seller, 20% to admin
    const salePrice = userItem.sale_price;
    const sellerAmount = Math.floor(salePrice * 0.8); // 80% to seller
    const adminFee = salePrice - sellerAmount; // 20% to admin

    // Find an admin account to receive the fee
    const { data: admins } = await supabase
      .from('users')
      .select('id, cash')
      .eq('is_admin', true)
      .limit(1);

    // Transfer cash from buyer
    await supabase
      .from('users')
      .update({ cash: user.cash - salePrice })
      .eq('id', req.user.id);

    // Transfer 80% to seller
    await supabase
      .from('users')
      .update({ cash: seller.cash + sellerAmount })
      .eq('id', userItem.user_id);

    // Transfer 20% to admin (if admin exists)
    if (admins && admins.length > 0) {
      const admin = admins[0];
      await supabase
        .from('users')
        .update({ cash: admin.cash + adminFee })
        .eq('id', admin.id);
    }

    // Transfer item
    await supabase
      .from('user_items')
      .update({
        user_id: req.user.id,
        is_for_sale: false,
        sale_price: null,
        purchase_price: salePrice
      })
      .eq('id', user_item_id);

    // Update RAP
    await supabase
      .from('item_rap_history')
      .insert([
        {
          item_id: userItem.item_id,
          rap_value: salePrice,
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

