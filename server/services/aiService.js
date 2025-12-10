const supabase = require('../config/supabase');

// Constants
const AI_COUNT_TARGET = 50;
const ONLINE_PERCENTAGE = 0.3; // 30% target online
const TICK_RATE = 5000; // 5 seconds
const ACTION_PROBABILITY = 0.4; // 40% chance to act per tick if online

// Personality Definitions
const PERSONALITIES = {
    'hoarder': {
        weights: { buy_new: 3, buy_resale: 3, list_item: 0.1, trade_send: 1, trade_check: 5 },
        trade_accept_threshold: 1.5, // Requires 50% overpay
        trade_decline_threshold: 1.2,
        description: 'Buys often, sells rarely, keeps high value items.'
    },
    'trader': {
        weights: { buy_new: 1, buy_resale: 3, list_item: 3, trade_send: 4, trade_check: 5 },
        trade_accept_threshold: 1.05, // Accepts 5% overpay/fair
        trade_decline_threshold: 0.9,
        description: 'Active in trades and listing, looks for fair/profit trades.'
    },
    'sniper': {
        weights: { buy_new: 0.5, buy_resale: 5, list_item: 1, trade_send: 2, trade_check: 5 },
        trade_accept_threshold: 1.3, // Wants 30% profit
        trade_decline_threshold: 1.0,
        description: 'Looks for underpriced deals and high profit trades.'
    },
    'casual': {
        weights: { buy_new: 1, buy_resale: 1, list_item: 1, trade_send: 1, trade_check: 3 },
        trade_accept_threshold: 0.95, // Might accept slight loss (-5%)
        trade_decline_threshold: 0.8,
        description: 'Random behavior, not very strict on values.'
    },
    'whale': {
        weights: { buy_new: 5, buy_resale: 5, list_item: 0.5, trade_send: 2, trade_check: 3 },
        trade_accept_threshold: 0.9, // Gives away value easily (-10%)
        trade_decline_threshold: 0.7,
        description: 'High balance, buys expensive stuff, carefree with value.'
    }
};

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
// Simple in-memory session tracking: map of userId -> { sessionEnd: number (timestamp) }
const aiSessions = {};

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

        const pKeys = Object.keys(PERSONALITIES);

        for (let i = 0; i < needed; i++) {
            const name = NAMES[Math.floor(Math.random() * NAMES.length)] + Math.floor(Math.random() * 1000);
            const personalityKey = pKeys[Math.floor(Math.random() * pKeys.length)];
            const startingCash = personalityKey === 'whale' ? 1000000 : Math.floor(Math.random() * 50000) + 1000;

            await supabase.from('users').insert([{
                username: name,
                email: `${name.toLowerCase()}@ai.local`,
                password: 'ai_password_secure', // Placeholder, they don't log in
                is_ai: true,
                cash: startingCash, // Use cash column
                personality: personalityKey,
                is_admin: false,
                created_at: new Date()
            }]);
        }
    }

    // Reset online status on boot
    await supabase.from('users').update({ is_online: false }).eq('is_ai', true);
    console.log('AI Users initialized.');
};

// Main Loop
const runAiLoop = async () => {
    if (!isRunning) return;

    try {
        // 1. Manage Online Status (Sessions)
        await manageAiSessions();

        // 2. Perform Actions for Online AI
        const { data: onlineAis } = await supabase
            .from('users')
            .select('*')
            .eq('is_ai', true)
            .eq('is_online', true);

        if (onlineAis && onlineAis.length > 0) {
            for (const ai of onlineAis) {
                // Check incoming trades PRIORITY action
                await checkIncomingTrades(ai);

                // Perform random action
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

const manageAiSessions = async () => {
    const { data: allAis } = await supabase.from('users').select('id, username, is_online').eq('is_ai', true);
    if (!allAis) return;

    const now = Date.now();

    // SYNC: Iterate ALL memory sessions to check expiry AND enforce DB online status
    const sessionIds = Object.keys(aiSessions);
    let activeMemoryCount = 0;

    for (const id of sessionIds) {
        const session = aiSessions[id];
        const user = allAis.find(u => u.id === id);

        if (!user) {
            // User deleted? Remove session
            delete aiSessions[id];
            continue;
        }

        if (session.sessionEnd < now) {
            // Expired
            await supabase.from('users').update({ is_online: false }).eq('id', id);
            delete aiSessions[id];
            // console.log(`[AI] Session ended for ${user.username}`);
        } else {
            activeMemoryCount++;
            // HEARTBEAT: If DB says offline, force it online
            if (!user.is_online) {
                // console.log(`[AI] Resyncing online status for ${user.username}`);
                supabase.from('users').update({ is_online: true }).eq('id', id).then(); // Fire and forget fix
            }
        }
    }

    // 2. Spawn new sessions if needed
    const onlineAis = allAis.filter(u => u.is_online); // Re-evaluate conceptually, but we rely on memory for spawning decisions
    const offlineAis = allAis.filter(u => !aiSessions[u.id]); // Offline = Not in memory session

    const targetOnline = Math.floor(allAis.length * ONLINE_PERCENTAGE);

    // Debug log VERBOSE
    // console.log(`[AI Cycle] Total: ${allAis.length}, DB-Online: ${onlineAis.length}, Mem-Online: ${activeMemoryCount}, Target: ${targetOnline}`);

    if (activeMemoryCount < targetOnline) {
        const needed = targetOnline - activeMemoryCount;

        // Shuffle offline ais
        if (offlineAis.length === 0) return;

        const candidates = offlineAis.sort(() => 0.5 - Math.random()).slice(0, needed + 2);

        let activated = 0;
        for (const ai of candidates) {
            const duration = (Math.random() * 13 + 2) * 60 * 1000;
            aiSessions[ai.id] = { sessionEnd: now + duration };

            const { error } = await supabase.from('users').update({ is_online: true }).eq('id', ai.id);
            if (!error) {
                activated++;
                if (activated <= 3) console.log(`[AI] Activating ${ai.username || ai.id}`);
            }
        }
        if (activated > 0) console.log(`[AI] Brought ${activated} bots online.`);
    }
};

const performAction = async (ai) => {
    const p = PERSONALITIES[ai.personality] || PERSONALITIES['casual'];
    const weights = p.weights;

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

    // execute
    if (action === 'buy_new') await actionBuyNew(ai);
    else if (action === 'buy_resale') await actionBuyResale(ai, p);
    else if (action === 'list_item') await actionList(ai, p);
    else if (action === 'trade_send') await actionInitiateTrade(ai, p);
    else if (action === 'trade_check') { /* Already handled in priority loop */ }
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

    // Deduct cash
    await supabase.from('users').update({ cash: ai.cash - item.current_price }).eq('id', ai.id);

    // Calculate Serial Number (Simulated)
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

const actionBuyResale = async (ai, personalityProfile) => {
    // Fetch random resale listings
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
        target = listings.find(l => l.sale_price < (l.items.rap || 0) * 0.85); // 15% under RAP
    } else {
        // Others check value logic gently
        target = listings.find(l => {
            const val = l.items.rap || l.items.value || 0;
            if (val === 0) return true;
            // Don't buy stupidly overpriced things unless whale
            if (ai.personality !== 'whale' && l.sale_price > val * 1.5) return false;
            return true;
        });
    }

    if (!target) {
        // Fallback random if not super strict
        if (ai.personality !== 'sniper') target = listings[Math.floor(Math.random() * listings.length)];
    }

    if (!target || target.user_id === ai.id) return; // Don't buy own

    // Buy Logic
    const sellerId = target.user_id;
    const price = target.sale_price;
    const adminFee = Math.floor(price * 0.3); // 30% tax
    const sellerAmount = price - adminFee;

    // 1. Deduct Buyer
    await supabase.from('users').update({ cash: ai.cash - price }).eq('id', ai.id);

    // 2. Credit Seller
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
    const oldRap = target.items.rap || 0;
    const newRap = oldRap === 0 ? price : Math.floor((oldRap * 9 + price) / 10);
    await supabase.from('items').update({ rap: newRap }).eq('id', target.items.id);

    // 5. Logs
    await supabase.from('transactions').insert([
        { user_id: ai.id, type: 'buy', amount: price, item_id: target.items.id, related_user_id: sellerId },
        { user_id: sellerId, type: 'sell', amount: price, item_id: target.items.id, related_user_id: ai.id }
    ]);

    await supabase.from('rap_change_log').insert([{
        item_id: target.items.id,
        old_rap: oldRap,
        new_rap: newRap,
        purchase_price: price
    }]);

    console.log(`[AI] ${ai.username} bought resale: ${target.items.name} for R$${price}`);
};

const actionList = async (ai, personalityProfile) => {
    if (ai.personality === 'hoarder') return;

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
    if (ai.personality === 'sniper') multiplier = 1.3;
    else if (ai.personality === 'trader') multiplier = 1.1;
    else multiplier = 0.9 + Math.random() * 0.4;

    const price = Math.max(1, Math.floor(rap * multiplier));

    await supabase.from('user_items').update({
        is_for_sale: true,
        sale_price: price
    }).eq('id', itemToSell.id);

    console.log(`[AI] ${ai.username} listed ${itemToSell.items.name} for R$${price}`);
};

// --- Trade Logic ---

const checkIncomingTrades = async (ai) => {
    // 50% chance to ignore checking (simulates not looking at trades constantly)
    if (Math.random() < 0.5) return;

    const { data: trades } = await supabase
        .from('trades')
        .select(`
            *,
            trade_items (
                id, side,
                user_items (
                    id, item_id,
                    items ( id, name, rap, value )
                )
            )
        `)
        .eq('receiver_id', ai.id)
        .eq('status', 'pending');

    if (!trades || trades.length === 0) return;

    // Process one trade per tick max
    const trade = trades[0];
    const p = PERSONALITIES[ai.personality] || PERSONALITIES['casual'];

    // Valuation
    let givingValue = 0;
    let receivingValue = 0;

    trade.trade_items.forEach(ti => {
        if (!ti.user_items || !ti.user_items.items) return;
        const itemVal = ti.user_items.items.value || ti.user_items.items.rap || 0;
        if (ti.side === 'receiver') { // Items AI gives (Receiver side of trade items are items owned by Receiver)
            givingValue += itemVal;
        } else { // Items AI receives (Sender side)
            receivingValue += itemVal;
        }
    });

    // Decision
    const ratio = receivingValue / (givingValue || 1); // Avoid div/0

    // Log thought
    // console.log(`[AI] ${ai.username} evaluating trade #${trade.id}. Give: ${givingValue}, Get: ${receivingValue}, Ratio: ${ratio.toFixed(2)}`);

    if (ratio >= p.trade_accept_threshold) {
        // Accept
        await acceptTrade(trade, ai);
    } else if (ratio < p.trade_decline_threshold) {
        // Decline
        await declineTrade(trade, ai);
    } else {
        // "Thinking" zone - small chance to decline, small chance to counter (if implemented), or just ignore (leave pending)
        if (Math.random() < 0.3) {
            await declineTrade(trade, ai);
        }
        // Counter logic effectively is 'decline' for now, or just leave it pending to annoy user
    }
};

const acceptTrade = async (trade, ai) => {
    // We need to re-verify ownership like the API does, but assuming state hasn't changed in milliseconds
    // Simplified execution for AI service
    try {
        const senderItems = trade.trade_items.filter(i => i.side === 'sender').map(i => i.user_items);
        const receiverItems = trade.trade_items.filter(i => i.side === 'receiver').map(i => i.user_items);

        // 1. Move Items
        if (senderItems.length > 0) {
            await supabase.from('user_items').update({ user_id: trade.receiver_id }).in('id', senderItems.map(i => i.id));
        }
        if (receiverItems.length > 0) {
            await supabase.from('user_items').update({ user_id: trade.sender_id }).in('id', receiverItems.map(i => i.id));
        }

        // 2. Update Trade
        await supabase.from('trades').update({ status: 'accepted', updated_at: new Date() }).eq('id', trade.id);

        console.log(`[AI] ${ai.username} ACCEPTED trade from user ${trade.sender_id}`);
    } catch (err) {
        console.error(`[AI] Failed to execute accept trade ${trade.id}`, err);
    }
};

const declineTrade = async (trade, ai) => {
    await supabase.from('trades').update({ status: 'declined', updated_at: new Date() }).eq('id', trade.id);
    console.log(`[AI] ${ai.username} DECLINED trade from user ${trade.sender_id}`);
};

const actionInitiateTrade = async (ai, p) => {
    // 1. Find a target (Human or AI) who has something we want
    // Simplified: Find a random limited item owned by someone else
    const { data: randomItems } = await supabase
        .from('user_items')
        .select('*, items:item_id(*)')
        .not('user_id', 'eq', ai.id)
        .eq('items.is_limited', true)
        .limit(10); // fetch a few candidates

    if (!randomItems || randomItems.length === 0) return;

    // Pick something we want
    const targetItem = randomItems[Math.floor(Math.random() * randomItems.length)];
    if (!targetItem || !targetItem.items) return;
    const targetUser = targetItem.user_id;

    // Don't spam same user? (omitted for simplicity)

    // 2. Select what to give
    // Find our own items >= val * 0.9 (try to lowball slightly or match)
    const targetVal = targetItem.items.rap || 0;

    const { data: myItems } = await supabase
        .from('user_items')
        .select('*, items:item_id(*)')
        .eq('user_id', ai.id)
        .eq('is_for_sale', false) // Use unlisted items for trading
        .eq('items.is_limited', true);

    if (!myItems || myItems.length === 0) return;

    // Try to find a combination of 1-3 items close to value
    // Super naive knapsack: just pick random items until value is close
    let offerItems = [];
    let currentOfferVal = 0;

    // Shuffle my items
    const shuffled = myItems.sort(() => 0.5 - Math.random());

    for (const item of shuffled) {
        if (!item.items) continue;
        if (currentOfferVal > targetVal * 1.2) break; // Don't overpay too much
        offerItems.push(item);
        currentOfferVal += (item.items.rap || 0);
        if (currentOfferVal >= targetVal * 0.9) break; // Good enough
    }

    if (offerItems.length === 0) return;

    // Check if offer is "fair" enough for us to send based on personality
    const ratio = currentOfferVal / targetVal;

    // If we are sniper, we only offer if ratio < 0.9 (we pay less)
    // If we are whale, we might pay ratio > 1.2

    // Actually send it
    const { data: trade, error } = await supabase
        .from('trades')
        .insert([{
            sender_id: ai.id,
            receiver_id: targetUser,
            status: 'pending'
        }])
        .select()
        .single();

    if (error) return;

    // Insert Trade Items
    const tradeItems = [];
    offerItems.forEach(i => {
        tradeItems.push({ trade_id: trade.id, user_item_id: i.id, side: 'sender' });
    });
    tradeItems.push({ trade_id: trade.id, user_item_id: targetItem.id, side: 'receiver' });

    await supabase.from('trade_items').insert(tradeItems);

    console.log(`[AI] ${ai.username} SENT trade to user ${targetUser} (Offer: ${Math.floor(currentOfferVal)}, Ask: ${targetVal})`);
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
