const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { generateChallenges, GIFTS, pickEventItem } = require('../utils/eventHelper');

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

// Refresh challenges
router.post('/refresh', authenticate, async (req, res) => {
    try {
        const COST = 100000;

        // Check cash
        const { data: user } = await supabase.from('users').select('cash').eq('id', req.user.id).single();
        if (user.cash < COST) {
            return res.status(400).json({ error: 'Insufficient cash' });
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
        // Calculate Serial
        const { count } = await supabase.from('user_items').select('*', { count: 'exact', head: true }).eq('item_id', itemId);
        const serial = (count || 0) + 1;

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
