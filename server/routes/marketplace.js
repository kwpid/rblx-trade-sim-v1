const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// Helper function to update daily RAP snapshot
const updateItemRAPSnapshot = async (itemId, salePrice) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Check if snapshot exists for today
    const { data: existingSnapshot } = await supabase
      .from('item_rap_history')
      .select('*')
      .eq('item_id', itemId)
      .eq('snapshot_date', today)
      .single();

    if (existingSnapshot) {
      // Update existing snapshot
      const newSalesCount = existingSnapshot.sales_count + 1;
      const newSalesVolume = existingSnapshot.sales_volume + salePrice;
      // Calculate new average RAP
      const newRapValue = Math.floor(
        (existingSnapshot.rap_value * existingSnapshot.sales_count + salePrice) / newSalesCount
      );

      await supabase
        .from('item_rap_history')
        .update({
          rap_value: newRapValue,
          sales_count: newSalesCount,
          sales_volume: newSalesVolume,
          timestamp: new Date().toISOString()
        })
        .eq('item_id', itemId)
        .eq('snapshot_date', today);

      return newRapValue;
    } else {
      // Create new snapshot for today
      await supabase
        .from('item_rap_history')
        .insert([{
          item_id: itemId,
          rap_value: salePrice,
          sales_count: 1,
          sales_volume: salePrice,
          snapshot_date: today,
          timestamp: new Date().toISOString()
        }]);

      return salePrice;
    }
  } catch (error) {
    console.error('Error updating RAP snapshot:', error);
    throw error;
  }
};


// Get deals (items listed below RAP)
router.get('/deals', async (req, res) => {
  try {
    // Fetch all items listed for sale
    const { data: listings, error } = await supabase
      .from('user_items')
      .select(`
        *,
        items:item_id (id, name, image_url, rap, current_price, scarcity, rarity)
      `)
      .eq('is_for_sale', true)
      .not('sale_price', 'is', null)
      .limit(500); // Fetch a batch to filter

    if (error) throw error;

    // Filter for deals: sale_price < RAP
    const deals = listings
      .filter(listing => {
        const rap = listing.items?.rap || 0;
        // Consider a deal if price is at least 10% below RAP? Or just any amount below?
        // User said "under RAP".
        // Also ensure RAP > 0
        return rap > 0 && listing.sale_price < rap;
      })
      .map(listing => {
        const rap = listing.items.rap;
        const price = listing.sale_price;
        const discountPercent = Math.round(((rap - price) / rap) * 100);
        return {
          id: listing.id,
          item_id: listing.items.id,
          item_name: listing.items.name,
          image_url: listing.items.image_url,
          price: price,
          rap: rap,
          discount: discountPercent,
          rarity: listing.items.rarity,
          is_projected: (listing.items.value > 0 && listing.items.rap > (listing.items.value * 1.25 + 50))
        };
      })
      .sort((a, b) => b.discount - a.discount) // Sort by best discount
      .slice(0, 50); // Return top 50 deals

    res.json(deals);
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

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

    // Calculate Serial Number
    const { count: existingCount } = await supabase
      .from('user_items')
      .select('*', { count: 'exact', head: true })
      .eq('item_id', item.id);

    const serialNumber = (existingCount || 0) + 1;

    // Add item to user inventory
    const { data: userItem, error: userItemError } = await supabase
      .from('user_items')
      .insert([
        {
          user_id: req.user.id,
          item_id: item.id,
          purchase_price: item.current_price,
          is_for_sale: false,
          serial_number: serialNumber
        }
      ])
      .select()
      .single();

    if (userItemError) throw userItemError;

    // Track Transaction
    await supabase.from('transactions').insert([{
      user_id: req.user.id,
      type: 'buy',
      amount: item.current_price,
      item_id: item.id,
      related_user_id: null // System purchase
    }]);



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
    let itemData = userItem.items;

    // Check if it's a timer item that should be limited now
    if (itemData && !itemData.is_limited && itemData.sale_type === 'timer' && itemData.sale_end_time && new Date(itemData.sale_end_time) < new Date()) {
      // Mark as limited
      await supabase
        .from('items')
        .update({ is_limited: true })
        .eq('id', itemData.id);

      itemData.is_limited = true;
    }

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

    // Update RAP snapshot for today
    const newRap = await updateItemRAPSnapshot(userItem.item_id, salePrice);

    // Track Transactions
    const transactions = [
      {
        user_id: req.user.id,
        type: 'buy',
        amount: salePrice,
        item_id: userItem.item_id,
        related_user_id: seller.id
      },
      {
        user_id: seller.id,
        type: 'sell',
        amount: salePrice, // Tracking raw sale amount, fees are hidden or can be calc'd
        item_id: userItem.item_id,
        related_user_id: req.user.id
      }
    ];
    await supabase.from('transactions').insert(transactions);



    // Update item RAP
    await supabase
      .from('items')
      .update({ rap: newRap })
      .eq('id', userItem.item_id);

    // Track RAP Change Log
    await supabase.from('rap_change_log').insert([{
      item_id: userItem.item_id,
      old_rap: userItem.items.rap || 0,
      new_rap: newRap,
      purchase_price: salePrice
    }]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error purchasing from player:', error);
    res.status(500).json({ error: 'Failed to purchase item' });
  }
});

module.exports = router;

