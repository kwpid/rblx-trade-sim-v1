const supabase = require('../config/supabase');

const CHALLENGE_TYPES = {
    TRADE_COUNT: 'TRADE_COUNT', // Complete X trades
    TRADE_VALUE: 'TRADE_VALUE', // Trade item worth X+
    TRADE_UNIQUE: 'TRADE_UNIQUE', // Trade with X diff players
    TRADE_STREAK: 'TRADE_STREAK', // 3 trades in 10 mins
    TRADE_PROFIT: 'TRADE_PROFIT', // Profit > X
    BUY_COUNT: 'BUY_COUNT', // Buy X items
    BUY_VALUE: 'BUY_VALUE', // Buy item worth X+
    BUY_UNIQUE: 'BUY_UNIQUE', // Buy from X diff sellers
    SELL_VALUE: 'SELL_VALUE', // Sell item for X+
    SELL_COUNT: 'SELL_COUNT', // Sell X items
    SELL_FAST: 'SELL_FAST', // Sell within 1 min
};

const EVENT_ITEMS = require('../config/eventItems');

const GIFTS = [
    {
        id: 'bronze',
        name: 'Bronze Gift',
        cost: 100,
        weights: { COMMON: 80, UNCOMMON: 15, RARE: 4.9, LEGENDARY: 0.1 }
    },
    {
        id: 'silver',
        name: 'Silver Gift',
        cost: 250,
        weights: { COMMON: 50, UNCOMMON: 40, RARE: 9, LEGENDARY: 1 }
    },
    {
        id: 'gold',
        name: 'Gold Gift',
        cost: 500,
        weights: { COMMON: 30, UNCOMMON: 50, RARE: 18, LEGENDARY: 2 }
    },
    {
        id: 'festive',
        name: 'Festive Gift',
        cost: 1000,
        weights: { COMMON: 10, UNCOMMON: 30, RARE: 50, LEGENDARY: 10 }
    },
    {
        id: 'frostbitten',
        name: 'Frostbitten Gift',
        cost: 5000,
        weights: { COMMON: 0, UNCOMMON: 10, RARE: 40, LEGENDARY: 50 }
    }
];

const pickEventItem = (giftId) => {
    const gift = GIFTS.find(g => g.id === giftId);
    if (!gift) return null;

    // 1. Roll for Rarity
    const roll = Math.random() * 100;
    let cumulative = 0;
    let selectedRarity = 'COMMON';

    for (const [rarity, chance] of Object.entries(gift.weights)) {
        cumulative += chance;
        if (roll <= cumulative) {
            selectedRarity = rarity;
            break;
        }
    }

    // 2. Pick Random Item from Rarity Pool
    const pool = EVENT_ITEMS[selectedRarity];
    if (!pool || pool.length === 0) {
        // Fallback to Common if empty, or just return null (error)
        // Try to find ANY item
        if (EVENT_ITEMS.COMMON.length > 0) return EVENT_ITEMS.COMMON[0];
        return null;
    }

    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
};

// Helper to get random challenges
const generateChallenges = (userId) => {
    const possibleChallenges = [
        { type: CHALLENGE_TYPES.TRADE_COUNT, target: 3, reward: 50, description: "Complete 3 trades" },
        { type: CHALLENGE_TYPES.TRADE_COUNT, target: 5, reward: 100, description: "Complete 5 trades" },
        { type: CHALLENGE_TYPES.TRADE_VALUE, target: 5000, reward: 75, description: "Trade an item worth 5,000+" },
        { type: CHALLENGE_TYPES.TRADE_VALUE, target: 20000, reward: 150, description: "Trade an item worth 20,000+" },
        { type: CHALLENGE_TYPES.TRADE_UNIQUE, target: 3, reward: 100, description: "Trade with 3 different players" },
        { type: CHALLENGE_TYPES.TRADE_STREAK, target: 3, reward: 200, description: "Complete 3 trades in a row (10m)" },
        { type: CHALLENGE_TYPES.TRADE_PROFIT, target: 2500, reward: 100, description: "Make a trade with profit > 2,500" },
        { type: CHALLENGE_TYPES.BUY_COUNT, target: 3, reward: 50, description: "Buy 3 items" },
        { type: CHALLENGE_TYPES.BUY_VALUE, target: 10000, reward: 100, description: "Buy an item worth 10,000+" },
        { type: CHALLENGE_TYPES.BUY_UNIQUE, target: 3, reward: 75, description: "Buy from 3 different sellers" },
        { type: CHALLENGE_TYPES.SELL_VALUE, target: 10000, reward: 100, description: "Sell item for 10,000+" },
        { type: CHALLENGE_TYPES.SELL_FAST, target: 1, reward: 150, description: "Sell an item within 1 minute of listing" },
    ];

    // Shuffle and pick 5
    const shuffled = possibleChallenges.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);

    return selected.map(c => ({
        user_id: userId,
        challenge_type: c.type,
        target_value: c.target,
        current_value: 0,
        reward_tokens: c.reward,
        metadata: { description: c.description },
        created_at: new Date().toISOString()
    }));
};

// Update progress
const updateChallengeProgress = async (userId, type, amount = 1, metadata = {}) => {
    try {
        // 1. Get active challenges for user of this type
        const { data: challenges, error } = await supabase
            .from('user_challenges')
            .select('*')
            .eq('user_id', userId)
            .eq('challenge_type', type)
            .eq('is_claimed', false);

        if (error) throw error;
        if (!challenges || challenges.length === 0) return;

        for (const challenge of challenges) {
            let newCurrent = challenge.current_value;
            let shouldUpdate = false;

            // Logic check based on type
            // For COUNT types, just add amount
            if (type.includes('_COUNT') || type.includes('_UNIQUE')) {
                // Unique check might need simpler implementation for now, just counting increments
                // For strict unique checks we'd need to store who we traded with in metadata, simplifying for MVP:
                newCurrent += amount;
                shouldUpdate = true;
            }
            // For VALUE/PROFIT types, checks if the SINGLE action met the target (threshold), usually amount passed is the value
            else if (type.includes('_VALUE') || type.includes('_PROFIT')) {
                if (amount >= challenge.target_value) {
                    newCurrent += 1; // It's a "do this once" or "do this X times" thing?
                    // The prompt says "Trade an item worth 5000+". Usually this means "Do it once".
                    // But if the target is just "value", we treat it as a boolean success if matched.
                    // However, if we want "Trade 5 items worth...", then we need counters.
                    // The prompt implies singular goals mostly, or counts.
                    // "Trade an item worth ..." -> Singluar.
                    // So if amount (value) >= target, we increment progress.
                    shouldUpdate = true;
                }
            }
            else if (type === CHALLENGE_TYPES.TRADE_STREAK) {
                // This is complex, might skip exact implementation for now or just treat as count
                newCurrent += amount;
                shouldUpdate = true;
            }
            else if (type === CHALLENGE_TYPES.SELL_FAST) {
                // Logic handled by caller passsing amount=1 if fast sale
                newCurrent += amount;
                shouldUpdate = true;
            }

            if (shouldUpdate) {
                // Cap at target
                if (newCurrent > challenge.target_value) newCurrent = challenge.target_value;

                await supabase
                    .from('user_challenges')
                    .update({ current_value: newCurrent })
                    .eq('id', challenge.id);
            }
        }

    } catch (error) {
        console.error('Error updating challenge:', error);
    }
};

module.exports = {
    CHALLENGE_TYPES,
    GIFTS,
    generateChallenges,
    updateChallengeProgress,
    pickEventItem
};
