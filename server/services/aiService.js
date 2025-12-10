const supabase = require('../config/supabase');

// Constants
const AI_COUNT_TARGET = 50;
const ONLINE_PERCENTAGE = 0.3; // 30% online
const TICK_RATE = 5000; // 5 seconds
const ACTION_PROBABILITY = 0.4; // 40% chance to act per tick if online

const PERSONALITIES = [
    'hoarder', // Buys often, sells rarely, keeps high value
    'trader',  // Active in trades and listing
    'sniper',  // Looks for deals (under RAP)
    'casual',  // Random behavior
    'whale'    // High balance, buys expensive stuff
];

const NAMES = [
    "CoolGamer123", "TradeMaster_99", "RobloxLegend", "BloxBuilder", "NoobSlayer", "ProTraderX", "RichieRich",
    "ItemCollector", "MarketMogul", "SpeedRunner", "PixelWarrior", "ShadowNinja", "GoldenDominus", "ValkyrieQueen",
    "BrickSmith", "LuaCoder", "RedValkFan", "BlueSteel", "NeonKnight", "VoidWalker", "GalaxyGamer", "StarDust",
    "CloudHopper", "WindWalker", "FireMage", "IceQueen", "StormBringer", "ThunderGod", "EarthQuake", "TornadoAlly",
    "SunChaser", "MoonWalker", "StarGazer", "PlanetHopper", "CometRider", "MeteorMan", "AsteroidAce", "NebulaNinja",
    "CosmicKing", "GalacticHero", "UniverseUser", "DimensionDiver", "TimeTraveler", "SpaceCadet", "RocketMan",
    "AlienHunter", "UFOSpotter", "MartianMan", "VenusVisitor", "JupiterJumper"
];

// Service State
let isRunning = false;

// Initialization
const initAiUsers = async () => {
    console.log('Initializing AI Users...');

    // Check current count
    const { count, error } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('is_ai', true);

    if (error) {
        console.error('Error checking AI count:', error);
        return;
    }

    if (count < AI_COUNT_TARGET) {
        const needed = AI_COUNT_TARGET - count;
        console.log(`Creating ${needed} new AI users...`);

        for (let i = 0; i < needed; i++) {
            const name = NAMES[Math.floor(Math.random() * NAMES.length)] + Math.floor(Math.random() * 1000);
            const personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
            const startingCash = personality === 'whale' ? 1000000 : Math.floor(Math.random() * 50000) + 1000;

            await supabase.from('users').insert([{
                username: name,
                email: `${name.toLowerCase()}@ai.local`,
                password: 'ai_password_secure', // Placeholder, they don't log in
                is_ai: true,
                cash: startingCash,
                personality: personality,
                is_admin: false,
                created_at: new Date()
            }]);
        }
    }

    // Reset online status
    await supabase.from('users').update({ is_online: false }).eq('is_ai', true);
    console.log('AI Users initialized.');
};

// Main Loop
const runAiLoop = async () => {
    if (!isRunning) return;

    try {
        // 1. Manage Online Status
        await updateOnlineStatus();

        // 2. Perform Actions for Online AI
        const { data: onlineAis } = await supabase
            .from('users')
            .select('*')
            .eq('is_ai', true)
            .eq('is_online', true);

        if (onlineAis) {
            for (const ai of onlineAis) {
                if (Math.random() < ACTION_PROBABILITY) {
                    await performAction(ai);
                }
            }
        }
    } catch (err) {
        console.error('Error in AI loop:', err);
    }

    setTimeout(runAiLoop, TICK_RATE);
};

const updateOnlineStatus = async () => {
    // Randomly flip some users online/offline
    // Ideally we want ~30% online
    const { data: allAis } = await supabase.from('users').select('id, is_online').eq('is_ai', true);
    if (!allAis) return;

    for (const ai of allAis) {
        // 10% chance to change state
        if (Math.random() < 0.1) {
            // Bias towards target percentage
            const target = Math.random() < ONLINE_PERCENTAGE;
            if (ai.is_online !== target) {
                await supabase.from('users').update({ is_online: target }).eq('id', ai.id);
            }
        }
    }
};

const performAction = async (ai) => {
    // Weighted selection based on personality
    let weights = { buy_new: 1, buy_resale: 1, list_item: 1, trade: 1 };

    switch (ai.personality) {
        case 'hoarder':
            weights = { buy_new: 3, buy_resale: 3, list_item: 0.1, trade: 1 };
            break;
        case 'trader':
            weights = { buy_new: 1, buy_resale: 3, list_item: 3, trade: 4 };
            break;
        case 'sniper':
            weights = { buy_new: 0.5, buy_resale: 5, list_item: 1, trade: 3 };
            break;
        case 'whale':
            weights = { buy_new: 5, buy_resale: 5, list_item: 0.5, trade: 2 };
            break;
        case 'casual': // Random behavior
            weights = { buy_new: 1, buy_resale: 1, list_item: 1, trade: 1 };
            break;
    }

    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    let action = 'buy_new';

    for (const [act, weight] of Object.entries(weights)) {
        random -= weight;
        if (random <= 0) {
            action = act;
            break;
        }
    }

    if (action === 'buy_new') await actionBuyNew(ai);
    else if (action === 'buy_resale') await actionBuyResale(ai);
    else if (action === 'list_item') await actionList(ai);
    else if (action === 'trade') await actionTrade(ai);
};

// --- Actions ---

const actionBuyNew = async (ai) => {
    // Find available shop items
    const { data: items } = await supabase
        .from('items')
        .select('*')
        .eq('is_off_sale', false)
        .eq('is_limited', false) // Only shop items
        .lt('current_price', ai.cash); // Can afford

    if (!items || items.length === 0) return;

    // Pick random item
    const item = items[Math.floor(Math.random() * items.length)];

    // Check stock if applicable
    if (item.sale_type === 'stock' && item.remaining_stock <= 0) return;

    // Simulate Purchase (reuse logic or direct DB)
    // Direct DB is cleaner for service than calling own API

    // Deduct cash
    await supabase.from('users').update({ cash: ai.cash - item.current_price }).eq('id', ai.id);

    // Calculate Serial Number
    const { count: existingCount } = await supabase
        .from('user_items')
        .select('*', { count: 'exact', head: true })
        .eq('item_id', item.id);
    const serialNumber = (existingCount || 0) + 1;

    // Add Item
    await supabase.from('user_items').insert([{
        user_id: ai.id,
        item_id: item.id,
        purchase_price: item.current_price,
        is_for_sale: false,
        serial_number: serialNumber
    }]);

    // Update Stock if needed
    if (item.sale_type === 'stock') {
        const newStock = item.remaining_stock - 1;
        await supabase.from('items').update({
            remaining_stock: newStock,
            is_limited: newStock <= 0
        }).eq('id', item.id);
    }

    // Transaction Log
    await supabase.from('transactions').insert([{
        user_id: ai.id,
        type: 'buy',
        amount: item.current_price,
        item_id: item.id,
        related_user_id: null
    }]);

    console.log(`[AI] ${ai.username} bought new item: ${item.name}`);
};

const actionBuyResale = async (ai) => {
    // Fetch random resale listings
    // Sniper looks for deals < RAP
    let query = supabase
        .from('user_items')
        .select('*, items:item_id(*)')
        .eq('is_for_sale', true)
        .lt('sale_price', ai.cash)
        .limit(20);

    const { data: listings } = await query;
    if (!listings || listings.length === 0) return;

    let target = null;
    if (ai.personality === 'sniper') {
        target = listings.find(l => l.sale_price < (l.items.rap || 0) * 0.9); // 10% under RAP
    }

    if (!target) {
        target = listings[Math.floor(Math.random() * listings.length)];
    }

    if (!target || target.user_id === ai.id) return; // Don't buy own

    // Buy Logic
    const sellerId = target.user_id;
    const price = target.sale_price;
    const adminFee = Math.floor(price * 0.2); // 20% tax
    const sellerAmount = price - adminFee; // Simple calculation here

    // 1. Deduct Buyer (AI)
    await supabase.from('users').update({ cash: ai.cash - price }).eq('id', ai.id);

    // 2. Credit Seller (fetch current cash first to be safe, or use RPC increment if avail, but standard update is OK here)
    const { data: seller } = await supabase.from('users').select('cash').eq('id', sellerId).single();
    if (seller) {
        await supabase.from('users').update({ cash: seller.cash + sellerAmount }).eq('id', sellerId);
    }

    // 3. Transfer Item
    await supabase.from('user_items').update({
        user_id: ai.id,
        is_for_sale: false,
        sale_price: null,
        purchase_price: price
    }).eq('id', target.id);

    // 4. Update RAP
    // Need custom logic or duplicate from marketplace.js
    // For simplicity, naive avg
    const oldRap = target.items.rap || 0;
    // VERY simple moving average for simulation
    const newRap = oldRap === 0 ? price : Math.floor((oldRap * 9 + price) / 10);

    await supabase.from('items').update({ rap: newRap }).eq('id', target.items.id);

    // 5. Logs
    // Transaction
    await supabase.from('transactions').insert([
        {
            user_id: ai.id,
            type: 'buy',
            amount: price,
            item_id: target.items.id,
            related_user_id: sellerId
        },
        {
            user_id: sellerId,
            type: 'sell',
            amount: price,
            item_id: target.items.id,
            related_user_id: ai.id
        }
    ]);

    // RAP Log
    await supabase.from('rap_change_log').insert([{
        item_id: target.items.id,
        old_rap: oldRap,
        new_rap: newRap,
        purchase_price: price
    }]);

    console.log(`[AI] ${ai.username} bought resale: ${target.items.name} for R$${price}`);
};

const actionList = async (ai) => {
    if (ai.personality === 'hoarder') return; // Hoarders don't sell

    // Find unlisted limiteds
    const { data: myItems } = await supabase
        .from('user_items')
        .select('*, items:item_id(*)')
        .eq('user_id', ai.id)
        .eq('is_for_sale', false);

    if (!myItems || myItems.length === 0) return;

    // Filter for limiteds
    const limiteds = myItems.filter(i => i.items.is_limited);
    if (limiteds.length === 0) return;

    const itemToSell = limiteds[Math.floor(Math.random() * limiteds.length)];
    const rap = itemToSell.items.rap || itemToSell.items.value || 100;

    // Price logic
    let multiplier = 1.0;
    if (ai.personality === 'sniper') multiplier = 1.2; // Sell for profit
    else if (ai.personality === 'trader') multiplier = 1.0; // Fair price
    else multiplier = 0.9 + Math.random() * 0.4; // Random 0.9 - 1.3

    const price = Math.max(1, Math.floor(rap * multiplier));

    await supabase.from('user_items').update({
        is_for_sale: true,
        sale_price: price
    }).eq('id', itemToSell.id);

    console.log(`[AI] ${ai.username} listed ${itemToSell.items.name} for R$${price}`);
};

module.exports = {
    start: () => {
        isRunning = true;
        initAiUsers().then(() => runAiLoop());
    },
    stop: () => {
        isRunning = false;
    }
};
