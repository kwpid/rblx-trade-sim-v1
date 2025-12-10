const cron = require('node-cron');
const supabase = require('../config/supabase');

// Helper function to calculate and save snapshots
const calculateAndSaveSnapshots = async (isNewDay = false) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

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

            // Only use item.value if it's explicitly set (not null/undefined), otherwise start with 0
            let itemValue = (itemData.value !== null && itemData.value !== undefined) ? itemData.value : 0;

            // If value is NOT set (0), and it's limited/oos, use reseller price as fallback
            if (itemValue === 0 && (itemData.is_limited || isOutOfStock) && resellerPriceMap.has(userItem.item_id)) {
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

    // Upsert all snapshots (will create new or update existing for today)
    if (snapshots.length > 0) {
      const { error: insertError } = await supabase
        .from('player_snapshots')
        .upsert(snapshots, {
          onConflict: 'user_id,snapshot_date',
          ignoreDuplicates: false
        });

      if (insertError) {
        console.error('Error upserting snapshots:', insertError);
      } else {
        const action = isNewDay ? 'created' : 'updated';
        console.log(`Successfully ${action} ${snapshots.length} player snapshots for ${today}`);
      }
    }
  } catch (error) {
    console.error('Error in snapshot calculation:', error);
  }
};

// Run daily at midnight to create a new snapshot for the new day
cron.schedule('0 0 * * *', async () => {
  console.log('Starting daily player snapshot creation (midnight)...');
  await calculateAndSaveSnapshots(true);
});

// Run every 5 minutes to update today's snapshot
cron.schedule('*/5 * * * *', async () => {
  console.log('Updating today\'s player snapshots...');
  await calculateAndSaveSnapshots(false);
});

module.exports = {};

