const supabase = require('../config/supabase');
const BADGES = require('../config/badges');

/**
 * Checks and awards badges to a user based on their current inventory and status.
 * Badges are permanent: once earned, they are never lost.
 * @param {string} userId - The ID of the user to check
 */
const checkAndAwardBadges = async (userId) => {
    try {
        if (!userId) return;

        // 1. Fetch User (for current badges)
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('badges')
            .eq('id', userId)
            .single();

        if (userError || !user) {
            console.error('Error fetching user for badges:', userError);
            return;
        }

        const currentBadges = user.badges || [];
        const earnedBadgeIds = new Set(currentBadges.map(b => b.id));
        const newBadges = [];

        // 2. Fetch User Inventory (with Item Details)
        const { data: inventory, error: invError } = await supabase
            .from('user_items')
            .select(`
                serial_number,
                items:item_id (
                    id,
                    name,
                    value,
                    rap,
                    is_limited,
                    stock_count
                )
            `)
            .eq('user_id', userId);

        if (invError) {
            console.error('Error fetching inventory for badges:', invError);
            return;
        }

        // --- PRE-CALCULATE STATS ---
        let totalValue = 0;
        let totalLimiteds = 0;
        let rareCount = 0;
        const itemCounts = {}; // itemId -> count

        inventory.forEach(entry => {
            const item = entry.items;
            if (!item || !item.is_limited) return;

            // Value Calculation
            const val = item.value || item.rap || 0;
            totalValue += val;

            // Total Count
            totalLimiteds++;

            // Rare Count (Stock <= 50)
            if (item.stock_count <= 50) {
                rareCount++;
            }

            // Hoard Count
            itemCounts[item.id] = (itemCounts[item.id] || 0) + 1;
        });

        const maxHoardCount = Math.max(0, ...Object.values(itemCounts));

        // --- CHECK BADGES ---
        const now = new Date().toISOString();

        for (const badge of BADGES) {
            if (earnedBadgeIds.has(badge.id)) continue; // Already have it

            let earned = false;

            switch (badge.type) {
                case 'wealth':
                    if (totalValue >= badge.threshold) earned = true;
                    break;

                case 'serial_specific':
                    // Check if they own ANY item with this serial
                    if (inventory.some(i => i.items?.is_limited && i.serial_number === badge.serial)) {
                        earned = true;
                    }
                    break;

                case 'serial_range':
                    // Check if they own ANY item with serial < max
                    if (inventory.some(i => i.items?.is_limited && i.serial_number < badge.max)) {
                        earned = true;
                    }
                    break;

                case 'item_name_match':
                    // Check if they own ANY item containing the match string
                    if (inventory.some(i => i.items?.is_limited && i.items.name.toLowerCase().includes(badge.match.toLowerCase()))) {
                        earned = true;
                    }
                    break;

                case 'rare_count':
                    if (rareCount >= badge.count) earned = true;
                    break;

                case 'hoard_count':
                    if (maxHoardCount >= badge.count) earned = true;
                    break;

                case 'total_count':
                    if (totalLimiteds >= badge.count) earned = true;
                    break;
            }

            if (earned) {
                newBadges.push({
                    id: badge.id,
                    earned_at: now
                });
                earnedBadgeIds.add(badge.id); // Prevent dupes in same run
            }
        }

        // --- SAVE UPDATES ---
        if (newBadges.length > 0) {
            const updatedBadges = [...currentBadges, ...newBadges];
            const { error: updateError } = await supabase
                .from('users')
                .update({ badges: updatedBadges })
                .eq('id', userId);

            if (updateError) {
                console.error('Error updating badges:', updateError);
            } else {
                console.log(`[Badges] User ${userId} earned ${newBadges.length} new badges: ${newBadges.map(b => b.id).join(', ')}`);

                // NOTIFICATION (Optional: Send notification to user about new badges)
                const notifPayload = newBadges.map(b => {
                    const badgeDef = BADGES.find(def => def.id === b.id);
                    return {
                        user_id: userId,
                        type: 'system', // or 'badge' if we add that type
                        message: `🎉 You earned a new badge: ${badgeDef ? badgeDef.name : b.id}!`,
                        link: `/profile/${userId}`, // Link to profile to see it
                        is_read: false,
                        created_at: now
                    };
                });

                await supabase.from('notifications').insert(notifPayload);
            }
        }

    } catch (error) {
        console.error('Error in checkAndAwardBadges:', error);
    }
};

module.exports = {
    checkAndAwardBadges
};
