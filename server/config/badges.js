const BADGES = [
    // --- WEALTH BADGES ---
    {
        id: 'wealth_100m',
        name: '100M+',
        description: 'Own an inventory of limiteds worth at least 100 million total value',
        icon: '💰', // Placeholder
        type: 'wealth',
        threshold: 100000000
    },
    {
        id: 'wealth_50m',
        name: '50M+',
        description: 'Own an inventory of limiteds worth at least 50 million total value',
        icon: '💵',
        type: 'wealth',
        threshold: 50000000
    },
    {
        id: 'wealth_20m',
        name: '20M+',
        description: 'Own an inventory of limiteds worth at least 20 million total value',
        icon: '💸',
        type: 'wealth',
        threshold: 20000000
    },
    {
        id: 'wealth_10m',
        name: '10M+',
        description: 'Own an inventory of limiteds worth at least 10 million total value',
        icon: '💎',
        type: 'wealth',
        threshold: 10000000
    },
    {
        id: 'wealth_5m',
        name: '5M+',
        description: 'Own an inventory of limiteds worth at least 5 million total value',
        icon: '🏦',
        type: 'wealth',
        threshold: 5000000
    },
    {
        id: 'wealth_1m',
        name: '1M+',
        description: 'Own an inventory of limiteds worth at least 1 million total value',
        icon: '🪙',
        type: 'wealth',
        threshold: 1000000
    },
    {
        id: 'wealth_500k',
        name: '500K+',
        description: 'Own an inventory of limiteds worth at least 500,000 total value',
        icon: '🔸',
        type: 'wealth',
        threshold: 500000
    },
    {
        id: 'wealth_100k',
        name: '100K+',
        description: 'Own an inventory of limiteds worth at least 100,000 total value',
        icon: '🔹',
        type: 'wealth',
        threshold: 100000
    },

    // --- SERIAL NUMBER BADGES ---
    {
        id: 'serial_1',
        name: 'Serial #1',
        description: 'Own a serial #1 limited',
        icon: '1️⃣',
        type: 'serial_specific',
        serial: 1
    },
    {
        id: 'serial_sequential',
        name: 'Sequential Serial',
        description: 'Own a limited with serial #123',
        icon: '🔢',
        type: 'serial_specific',
        serial: 123
    },
    {
        id: 'serial_low',
        name: 'Low Serial',
        description: 'Own a limited with a serial less than #10',
        icon: '⬇️',
        type: 'serial_range',
        max: 10 // < 10 means 1-9
    },

    // --- ITEM TYPE BADGES ---
    {
        id: 'dominator',
        name: 'Dominator',
        description: 'Own any limited Dominus',
        icon: '👑',
        type: 'item_name_match',
        match: 'Dominus'
    },
    {
        id: 'sparkly',
        name: 'Sparkly',
        description: 'Own a limited Sparkle Time Fedora',
        icon: '✨',
        type: 'item_name_match',
        match: 'Sparkle Time Fedora'
    },
    {
        id: 'federated',
        name: 'Federated',
        description: 'Own a valued Federation item',
        icon: '🏛️',
        type: 'item_name_match',
        match: 'Federation'
    },
    {
        id: 'enduring',
        name: 'Enduring',
        description: 'Own a limited Immortal Sword',
        icon: '⚔️',
        type: 'item_name_match',
        match: 'Immortal Sword'
    },

    // --- RARITY COLLECTION BADGES (Rare = Stock <= 50) ---
    {
        id: 'rare_supremist',
        name: 'Rare Supremist',
        description: 'Own 10 rare limiteds',
        icon: '🌟',
        type: 'rare_count',
        count: 10
    },
    {
        id: 'rare_enthusiast',
        name: 'Rare Enthusiast',
        description: 'Own 3 rare limiteds',
        icon: '⭐',
        type: 'rare_count',
        count: 3
    },
    {
        id: 'rare_owner',
        name: 'Rare Owner',
        description: 'Own a rare limited',
        icon: '🔷',
        type: 'rare_count',
        count: 1
    },

    // --- HOARDING BADGES (Copies of ONE item) ---
    {
        id: 'mega_hoarder',
        name: 'Mega Hoarder',
        description: 'Own 100 of one item',
        icon: '📦',
        type: 'hoard_count',
        count: 100
    },
    {
        id: 'hoarder',
        name: 'Hoarder',
        description: 'Own 50 of one item',
        icon: '🎒',
        type: 'hoard_count',
        count: 50
    },
    {
        id: 'mini_hoarder',
        name: 'Mini Hoarder',
        description: 'Own 10 of one item',
        icon: '👜',
        type: 'hoard_count',
        count: 10
    },

    // --- COLLECTION COUNT BADGES (Total Limiteds) ---
    {
        id: 'incurable_collector',
        name: 'Incurable Collector',
        description: 'Own at least 1000 limiteds',
        icon: '🏆',
        type: 'total_count',
        count: 1000
    },
    {
        id: 'devout_collector',
        name: 'Devout Collector',
        description: 'Own at least 100 limiteds',
        icon: '🎖️',
        type: 'total_count',
        count: 100
    },
    {
        id: 'collector',
        name: 'Collector',
        description: 'Own at least 10 limiteds',
        icon: '🎗️',
        type: 'total_count',
        count: 10
    }
];

module.exports = BADGES;
