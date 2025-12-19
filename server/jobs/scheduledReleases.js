const supabase = require('../config/supabase');
const { getItemDetails } = require('../utils/rolimons');
const { sendDiscordWebhook } = require('../utils/discord');

// Check for pending items ready to be released
const checkPendingReleases = async () => {
  try {
    const now = new Date().toISOString();

    // Get all pending items that are ready to be released
    const { data: pendingItems, error } = await supabase
      .from('pending_items')
      .select('*')
      .lte('scheduled_release_time', now);

    if (error) {
      console.error('Error fetching pending items:', error);
      return;
    }

    if (!pendingItems || pendingItems.length === 0) {
      return; // No items to release
    }

    console.log(`Found ${pendingItems.length} pending items ready for release`);

    for (const pendingItem of pendingItems) {
      try {
        // Calculate end time if timer
        let sale_end_time = null;
        if (pendingItem.sale_type === 'timer' && pendingItem.timer_duration) {
          const duration = parseFloat(pendingItem.timer_duration);
          let milliseconds = 0;

          switch (pendingItem.timer_unit) {
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

        // Create the actual item
        const { data: item, error: itemError } = await supabase
          .from('items')
          .insert([{
            roblox_item_id: pendingItem.roblox_item_id,
            name: pendingItem.name,
            description: pendingItem.description,
            image_url: pendingItem.image_url,
            initial_price: pendingItem.initial_price,
            current_price: pendingItem.initial_price,
            sale_type: pendingItem.sale_type,
            stock_count: pendingItem.sale_type === 'stock' ? pendingItem.stock_count : null,
            remaining_stock: pendingItem.sale_type === 'stock' ? pendingItem.stock_count : null,
            sale_end_time,
            is_limited: false,
            is_off_sale: pendingItem.is_off_sale,
            buy_limit: pendingItem.buy_limit,
            value: pendingItem.initial_value,
            trend: 'stable',
            demand: 'unknown',
            created_by: pendingItem.created_by
          }])
          .select()
          .single();

        if (itemError) throw itemError;

        console.log('Item released successfully:', item.name, 'ID:', item.id);

        // Send Webhook (Item Release) & In-Game Notifications
        try {
          if (!item.is_off_sale) {
            // Discord Webhook
            const webhookUrl = process.env.DISCORD_WEBHOOK_URL_ITEMS;

            if (webhookUrl) {
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

              console.log('[Scheduled Release] Sending webhook for:', item.name);
              await sendDiscordWebhook(webhookUrl, embed);
            }

            // GLOBAL NOTIFICATION
            // 1. Get all user IDs (Real + AI)
            const { data: allUsers } = await supabase.from('users').select('id');

            if (allUsers && allUsers.length > 0) {
              const notifPayload = allUsers.map(u => ({
                user_id: u.id,
                type: 'item_release',
                message: `New Item Dropped: ${item.name}!`,
                link: `/catalog/${item.id}`,
                is_read: false,
                created_at: new Date().toISOString()
              }));

              // Batch insert (supabase handles batch well)
              await supabase.from('notifications').insert(notifPayload);
              console.log(`[Scheduled Release] Broadcasted new item notification to ${allUsers.length} users.`);
            }
          } else {
            console.log(`Skipping webhook and notifications for OFF-SALE scheduled item: ${item.name}`);
          }
        } catch (err) {
          console.error("Failed to send item release notifications:", err);
        }

        // Delete the pending item
        await supabase
          .from('pending_items')
          .delete()
          .eq('id', pendingItem.id);

        console.log('Pending item deleted after successful release:', pendingItem.id);

      } catch (itemError) {
        console.error('Error releasing pending item:', pendingItem.id, itemError);
        // Don't delete the pending item if there was an error, so it can be retried
      }
    }

  } catch (error) {
    console.error('Error in checkPendingReleases:', error);
  }
};

// Run every minute
setInterval(checkPendingReleases, 60 * 1000);

// Run immediately on startup
checkPendingReleases();

module.exports = {};