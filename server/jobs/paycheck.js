const cron = require('node-cron');
const supabase = require('../config/supabase');

const { getOnlineUsers } = require('../middleware/auth');

// Run every minute to give players 250R$ paycheck
cron.schedule('* * * * *', async () => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, cash, is_online');

    if (error) {
      console.error('Error fetching users for paycheck:', error);
      return;
    }

    const onlineRealUserIds = getOnlineUsers();

    // Filter for online users (AI or Real)
    const onlineUsers = users.filter(u =>
      u.is_online === true || onlineRealUserIds.includes(u.id)
    );

    if (onlineUsers.length === 0) return;

    for (const user of onlineUsers) {
      await supabase
        .from('users')
        .update({ cash: user.cash + 250 })
        .eq('id', user.id);
    }

    console.log(`Paycheck distributed to ${onlineUsers.length} online users`);
  } catch (error) {
    console.error('Error in paycheck job:', error);
  }
});

// Check for items that should go limited (timer expired)
cron.schedule('* * * * *', async () => {
  try {
    const { data: items, error } = await supabase
      .from('items')
      .select('*')
      .eq('is_limited', false)
      .eq('sale_type', 'timer')
      .lte('sale_end_time', new Date().toISOString());

    if (error) {
      console.error('Error checking limited items:', error);
      return;
    }

    for (const item of items) {
      await supabase
        .from('items')
        .update({ is_limited: true })
        .eq('id', item.id);

      // Notify all users
      const { data: users } = await supabase
        .from('users')
        .select('id');

      if (users) {
        const notifications = users.map(user => ({
          user_id: user.id,
          type: 'item_limited',
          message: `${item.name} is now limited!`,
          data: { item_id: item.id }
        }));

        await supabase
          .from('notifications')
          .insert(notifications);
      }
    }
  } catch (error) {
    console.error('Error checking limited items:', error);
  }
});

module.exports = {};

