const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { generateChallenges, GIFTS, pickEventItem } = require('../utils/eventHelper');
const EVENT_ITEMS = require('../config/eventItems');

// Get event status
router.get('/status', authenticate, async (req, res) => {
    try {
        // Get user tokens
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('holiday_tokens, last_challenge_reset')
            .eq('id', req.user.id)
            .single();

        if (userError) throw userError;

        // Get active challenges
        const { data: challenges, error: chalError } = await supabase
            .from('user_challenges')
            .select('*')
            .eq('user_id', req.user.id)
            .eq('is_claimed', false);

        if (chalError) throw chalError;

        // If no challenges, generate them (first time)
        if (!challenges || challenges.length === 0) {
            // Check if we should auto-generate (maybe they completed all? or Is this first join?)
            // For now, if 0 active and not recently reset, maybe generate?
            // Let's just return empty and let client or explicit refresh handle it?
            // Better: If they have NEVER had challenges, generate.
            // Check if they have ANY challenges (including claimed)
            const { count } = await supabase
                .from('user_challenges')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', req.user.id);

            if (count === 0) {
                const newChallenges = generateChallenges(req.user.id);
                const { error: insError } = await supabase.from('user_challenges').insert(newChallenges);
                if (!insError) {
                    // Fetch again
                    const { data: refreshed } = await supabase.from('user_challenges').select('*').eq('user_id', req.user.id).eq('is_claimed', false);
                    return res.json({ tokens: user.holiday_tokens, challenges: refreshed, last_reset: user.last_challenge_reset });
                }
            }
        }

        res.json({
            tokens: user.holiday_tokens || 0,
            challenges: challenges || [],
            last_reset: user.last_challenge_reset
        });
    } catch (error) {
        console.error('Error fetching event status:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

// Get gift details (contents & odds)
// Get gift details (contents & odds)
router.get('/gift-details', async (req, res) => {
    try {
        if (!EVENT_ITEMS) {
            console.error('CRITICAL: EVENT_ITEMS is undefined');
            throw new Error('EVENT_ITEMS config missing');
        }
        if (!GIFTS) {
            console.error('CRITICAL: GIFTS is undefined');
            throw new Error('GIFTS config missing');
        }

        // 1. Collect all Item IDs
        const allIds = new Set();
        Object.values(EVENT_ITEMS).forEach(arr => {
            if (Array.isArray(arr)) arr.forEach(id => allIds.add(id));
        });

        // 2. Fetch Item Details
        // REMOVED 'rarity' from select as it does not exist in the items table
        const { data: items, error: dbError } = await supabase
            .from('items')
            .select('id, name, image_url, rap, value')
            .in('id', Array.from(allIds));

        if (dbError) {
            console.error('Supabase DB Error:', dbError);
            throw dbError;
        }

        if (!items) {
            console.error('Supabase returned null for items list (not empty array).');
            return res.status(500).json({ error: 'Failed to fetch event items' });
        }

        // Map for easy lookup
        const itemMap = {};
        items.forEach(i => itemMap[i.id] = i);

        // 3. Build Response
        const giftDetails = GIFTS.map(gift => {
            const possibleItems = [];

            // Calculate total weight for normalization (usually 100, but good to be safe)
            const totalWeight = Object.values(gift.weights).reduce((a, b) => a + b, 0);

            for (const [rarity, weight] of Object.entries(gift.weights)) {
                if (weight <= 0) continue;

                const pool = EVENT_ITEMS[rarity] || [];
                if (pool.length === 0) continue;

                const chancePerItem = (weight / totalWeight) / pool.length; // e.g. 50% / 2 items = 25% each

                pool.forEach(id => {
                    if (itemMap[id]) {
                        const itemData = itemMap[id];
                        possibleItems.push({
                            ...itemData,
                            value: itemData.is_limited ? itemData.value : 0, // Mask value if not limited
                            rarity: rarity, // Manually assign rarity from config
                            chance: chancePerItem * 100
                        });
                    }
                });
            }

            // Sort: Best (Legendary) -> Worst (Common), then by Value Descending
            const rarityRank = { LEGENDARY: 4, RARE: 3, UNCOMMON: 2, COMMON: 1 };

            return {
                ...gift,
                possible_items: possibleItems.sort((a, b) => {
                    // 1. Rarity (High to Low)
                    const rA = rarityRank[a.rarity] || 0;
                    const rB = rarityRank[b.rarity] || 0;
                    if (rA !== rB) return rB - rA;

                    // 2. Value (High to Low)
                    const valA = a.rap || a.value || 0;
                    const valB = b.rap || b.value || 0;
                    return valB - valA;
                })
            };
        });

        res.json({ gifts: giftDetails });

    } catch (error) {
        console.error('CRITICAL ERROR in /gift-details handler:', error);
        // Print stack trace
        console.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Refresh challenges
router.post('/refresh', authenticate, async (req, res) => {
    try {
        const COST = 100000;

        // Check cash
        const { data: user } = await supabase.from('users').select('cash').eq('id', req.user.id).single();
        if (user.cash < COST) {
            return res.status(400).json({ error: 'Insufficient cash' });
        }

        // Check for incomplete challenges
        const { data: activeChallenges } = await supabase
            .from('user_challenges')
            .select('*')
            .eq('user_id', req.user.id)
            .eq('is_claimed', false); // Only care about active ones

        // If any challenge is not completed (current < target), deny refresh
        const hasIncomplete = activeChallenges && activeChallenges.some(c => c.current_value < c.target_value);
        if (hasIncomplete) {
            return res.status(400).json({ error: 'Must complete all active challenges first' });
        }

        // Deduct cash
        await supabase.from('users').update({ cash: user.cash - COST }).eq('id', req.user.id);

        // Delete old active/unclaimed challenges
        await supabase.from('user_challenges').delete().eq('user_id', req.user.id).eq('is_claimed', false);

        // Generate new
        const newChallenges = generateChallenges(req.user.id);
        await supabase.from('user_challenges').insert(newChallenges);

        res.json({ success: true });
    } catch (error) {
        console.error('Error refreshing challenges:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

// Claim challenge
router.post('/claim/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: challenge } = await supabase.from('user_challenges').select('*').eq('id', id).single();
        if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
        if (challenge.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
        if (challenge.is_claimed) return res.status(400).json({ error: 'Already claimed' });
        if (challenge.current_value < challenge.target_value) return res.status(400).json({ error: 'Not completed' });

        // Award tokens
        const { data: user } = await supabase.from('users').select('holiday_tokens').eq('id', req.user.id).single();
        const newTokens = (user.holiday_tokens || 0) + challenge.reward_tokens;

        await supabase.from('users').update({ holiday_tokens: newTokens }).eq('id', req.user.id);
        await supabase.from('user_challenges').update({ is_claimed: true }).eq('id', id);

        res.json({ success: true, new_tokens: newTokens });
    } catch (error) {
        console.error('Error claiming:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

// Buy gift
router.post('/buy-gift', authenticate, async (req, res) => {
    try {
        const { giftId } = req.body;
        const gift = GIFTS.find(g => g.id === giftId);
        if (!gift) return res.status(404).json({ error: 'Gift not found' });

        // Check tokens
        const { data: user } = await supabase.from('users').select('holiday_tokens').eq('id', req.user.id).single();
        if ((user.holiday_tokens || 0) < gift.cost) {
            return res.status(400).json({ error: 'Insufficient tokens' });
        }

        // Pick item using weighted logic
        const itemId = pickEventItem(giftId);
        if (!itemId || itemId.includes('placeholder')) {
            return res.status(500).json({ error: 'Gift contents not ready yet!' });
        }

        // Deduct tokens
        const { error: tokenError } = await supabase.from('users').update({ holiday_tokens: user.holiday_tokens - gift.cost }).eq('id', req.user.id);
        if (tokenError) throw tokenError;

        // Award Item
        // 1. Get Item Details for response
        const { data: item } = await supabase.from('items').select('*').eq('id', itemId).single();
        if (!item) {
            // Rollback? Or just log error?
            console.error('Item not found for gift:', itemId);
            return res.status(500).json({ error: 'Item configuration error' });
        }

        // 2. Create User Item
        // Calculate Serial (exclude admin's serial #0)
        const { count: regularUserCount } = await supabase
            .from('user_items')
            .select('*', { count: 'exact', head: true })
            .eq('item_id', itemId)
            .neq('serial_number', 0);
        const serial = (regularUserCount || 0) + 1;

        const { data: userItem, error: uiError } = await supabase.from('user_items').insert([{
            user_id: req.user.id,
            item_id: itemId,
            purchase_price: 0, // Gifted
            is_for_sale: false,
            serial_number: serial
        }]).select().single();

        if (uiError) throw uiError;

        res.json({ success: true, item: item });

    } catch (error) {
        console.error('Error buying gift:', error);
        res.status(500).json({ error: 'Failed to buy gift' });
    }
});

module.exports = router;
