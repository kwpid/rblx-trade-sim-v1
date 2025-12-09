const cron = require('node-cron');
const supabase = require('../config/supabase');

// Run daily at midnight to create player value/rap snapshots
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('Starting daily player snapshot job...');
    
    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id');

    if (usersError) {
      console.error('Error fetching users for snapshot:', usersError);
      return;
    }

    if (!users || users.length === 0) {
      console.log('No users found for snapshot');
      return;
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const snapshots = [];

    // Calculate value and RAP for each user
    for (const user of users) {
      try {
        // Get user's inventory
        const { data: inventory, error: inventoryError } = await supabase
          .from('user_items')
          .select(`
            *,
            items:item_id (*)
          `)
          .eq('user_id', user.id);

        if (inventoryError) {
          console.error(`Error fetching inventory for user ${user.id}:`, inventoryError);
          continue;
        }

        let totalValue = 0;
        let totalRAP = 0;

        if (inventory && inventory.length > 0) {
          // Get reseller prices for items that are limited or out of stock
          const itemIds = inventory.map(item => item.item_id);
          const { data: resellers } = await supabase
            .from('user_items')
            .select('item_id, sale_price')
            .in('item_id', itemIds)
            .eq('is_for_sale', true)
            .order('sale_price', { ascending: true });

          // Create a map of item_id to best reseller price
          const resellerPriceMap = new Map();
          if (resellers) {
            resellers.forEach(reseller => {
              if (!resellerPriceMap.has(reseller.item_id) || 
                  resellerPriceMap.get(reseller.item_id) > reseller.sale_price) {
                resellerPriceMap.set(reseller.item_id, reseller.sale_price);
              }
            });
          }

          // Get RAP history for all items to get current RAP
          const rapPromises = itemIds.map(async (itemId) => {
            try {
              const { data: rapHistory } = await supabase
                .from('item_rap_history')
                .select('rap_value')
                .eq('item_id', itemId)
                .order('timestamp', { ascending: false })
                .limit(1);
              
              if (rapHistory && rapHistory.length > 0) {
                return { itemId, rap: rapHistory[0].rap_value };
              }
              return { itemId, rap: null };
            } catch (e) {
              return { itemId, rap: null };
            }
          });

          const rapResults = await Promise.all(rapPromises);
          const rapMap = new Map();
          rapResults.forEach(({ itemId, rap }) => {
            if (rap !== null) {
              rapMap.set(itemId, rap);
            }
          });

          // Calculate totals
          inventory.forEach(userItem => {
            const itemData = userItem.items;
            if (!itemData) return;

            // Calculate value
            const isOutOfStock = itemData.is_off_sale || 
              (itemData.sale_type === 'stock' && itemData.remaining_stock <= 0);
            
            let itemValue = itemData.value || itemData.current_price || userItem.purchase_price || 0;
            
            // If out of stock or limited, use reseller price if available
            if ((itemData.is_limited || isOutOfStock) && resellerPriceMap.has(userItem.item_id)) {
              itemValue = resellerPriceMap.get(userItem.item_id);
            }
            
            totalValue += itemValue;

            // Calculate RAP
            const itemRAP = rapMap.get(userItem.item_id) || itemData.current_price || userItem.purchase_price || 0;
            totalRAP += itemRAP;
          });
        }

        snapshots.push({
          user_id: user.id,
          total_value: totalValue,
          total_rap: totalRAP,
          snapshot_date: today
        });
      } catch (error) {
        console.error(`Error processing snapshot for user ${user.id}:`, error);
      }
    }

    // Insert all snapshots (using upsert to handle duplicates)
    if (snapshots.length > 0) {
      const { error: insertError } = await supabase
        .from('player_snapshots')
        .upsert(snapshots, {
          onConflict: 'user_id,snapshot_date',
          ignoreDuplicates: false
        });

      if (insertError) {
        console.error('Error inserting snapshots:', insertError);
      } else {
        console.log(`Successfully created ${snapshots.length} player snapshots for ${today}`);
      }
    }
  } catch (error) {
    console.error('Error in player snapshot job:', error);
  }
});

module.exports = {};

