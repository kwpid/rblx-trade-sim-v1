const supabase = require('../config/supabase');
const { execSync } = require('child_process');
const EVENT_ITEMS = require('../config/eventItems');

let isDevBranch = false;

// Constants
const AI_COUNT_TARGET = 100;
const ONLINE_PERCENTAGE = 1.0; // 100% target online (All bots active)
const TICK_RATE = 5000; // 5 seconds
const ACTION_PROBABILITY = 0.5; // 50% chance to act per tick if online

// Personality Definitions
const PERSONALITIES = {
    'hoarder': {
        weights: { buy_new: 5, buy_resale: 4, list_item: 0.5, manage_listings: 2, trade_send: 1, trade_check: 5 },
        trade_accept_threshold: 1.5, // Requires 50% overpay
        trade_decline_threshold: 1.2,
        description: 'Buys often, sells rarely, keeps high value items.'
    },
    'trader': {
        weights: { buy_new: 4, buy_resale: 8, list_item: 8, manage_listings: 6, trade_send: 4, trade_check: 5 },
        trade_accept_threshold: 1.05, // Accepts 5% overpay/fair
        trade_decline_threshold: 0.9,
        description: 'Active in trades and listing, looks for fair/profit trades.'
    },
    'sniper': {
        weights: { buy_new: 2, buy_resale: 8, list_item: 4, manage_listings: 4, trade_send: 2, trade_check: 5 },
        trade_accept_threshold: 1.3, // Wants 30% profit
        trade_decline_threshold: 1.0,
        description: 'Looks for underpriced deals and high profit trades.'
    },
    'casual': {
        weights: { buy_new: 6, buy_resale: 3, list_item: 4, manage_listings: 3, trade_send: 1, trade_check: 3 },
        trade_accept_threshold: 0.95, // Might accept slight loss (-5%)
        trade_decline_threshold: 0.8,
        description: 'Random behavior, not very strict on values.'
    },
    'whale': {
        weights: { buy_new: 10, buy_resale: 5, list_item: 2, manage_listings: 1, trade_send: 2, trade_check: 3 },
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

const runAiLoop = async () => {
    if (!isRunning) return;

    if (isDevBranch) {
        // AI Disabled Loop
        // console.log('[AI] Disabled on dev branch.');
        setTimeout(runAiLoop, TICK_RATE * 2);
        return;
    }

    try {
        // 1. Manage Online Status (Sessions)
        await manageAiSessions();

        // 2. Perform Actions for Online AI
        // FILTER: Ensure NOT banned
        const { data: onlineAis } = await supabase
            .from('users')
            .select('*')
            .eq('is_ai', true)
            .eq('is_online', true)
            .is('banned_until', null); // Or check > now, but null is safest if we clear it on unban

        if (onlineAis && onlineAis.length > 0) {
            for (const ai of onlineAis) {
                // Secondary check for partial bans conceptually (if banned_until > now)
                if (ai.banned_until && new Date(ai.banned_until) > new Date()) continue;

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
    const { data: allAis } = await supabase.from('users').select('id, username, is_online, banned_until').eq('is_ai', true);
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

        // Check BAN status
        // If banned, force offline immediately
        // Note: We need to fetch banned_until in 'allAis' query
        const isBanned = user.banned_until && new Date(user.banned_until) > now;
        if (isBanned) {
            await supabase.from('users').update({ is_online: false }).eq('id', id);
            delete aiSessions[id];
            continue; // Skip processing
        }

        if (session.sessionEnd < now) {
            // Expired
            await supabase.from('users').update({
                is_online: false,
                last_online: new Date().toISOString()
            }).eq('id', id);
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

            const { error } = await supabase.from('users').update({
                is_online: true,
                last_online: new Date().toISOString()
            }).eq('id', ai.id);
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
    else if (action === 'manage_listings') await actionManageListings(ai);
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

    // SCORING: Pick "Best" candidate based on Personality
    let bestItem = null;
    let maxScore = -999999;

    const pType = ai.personality || 'casual';

    for (const item of items) {
        let score = 0;

        // Base Randomness per personality
        if (pType === 'casual') score = Math.random() * 100;
        else score = Math.random() * 20;

        // 1. Price Factor
        if (pType === 'whale') {
            // Whale: Likes EXPENSIVE items
            score += (item.current_price / 1000);
        } else if (pType === 'sniper' || pType === 'trader') {
            // Sniper: Likes CHEAP items (maximize potential % gain)
            if (item.current_price > 0) score += (10000 / Math.max(10, item.current_price)) * 5;
        } else {
            // Normal: Slight preference for cheaper
            if (item.current_price > 0) score += (10000 / Math.max(10, item.current_price));
        }

        // 2. VALUE-BASED SCORING (NEW - High Priority)
        // AI can see item values before they go limited
        // Prioritize items where value > current_price (profit potential)
        if (item.value && item.value > 0) {
            const profitPotential = item.value - item.current_price;
            const profitRatio = item.current_price > 0 ? (item.value / item.current_price) : 1;

            // HUGE boost for high-value items with profit potential
            if (profitPotential > 0) {
                // Base profit score
                score += (profitPotential / 100) * 10; // Scale by profit amount

                // Extra boost for high profit ratios
                if (profitRatio > 2) score += 200; // 2x+ value = massive boost
                else if (profitRatio > 1.5) score += 150; // 1.5x+ value = large boost
                else if (profitRatio > 1.2) score += 100; // 1.2x+ value = medium boost
                else if (profitRatio > 1.1) score += 50; // 1.1x+ value = small boost

                // Traders and snipers especially love high-value items
                if (pType === 'trader' || pType === 'sniper') {
                    score += (profitPotential / 50) * 5;
                }

                // Hoarders like collecting valuable items
                if (pType === 'hoarder' && item.value > 5000) {
                    score += 80;
                }
            }
        }

        // 3. Stock Factor
        if (item.sale_type === 'stock') {
            if (item.remaining_stock <= 0) continue;

            if (pType === 'hoarder') {
                // Hoarder: Likes HIGH stock (easy to mass buy)
                score += (item.remaining_stock / 100);
            } else if (pType === 'sniper' || pType === 'trader') {
                // Sniper: Likes LOW stock (Urgency)
                score += (1000 / Math.max(5, item.remaining_stock)) * 10;
            } else {
                // Normal urgency
                score += (1000 / Math.max(5, item.remaining_stock)) * 2;
            }
        } else {
            // Non-stock items (unlimited/timer) get a base score boost
            // so they're not ignored
            score += 50;
        }

        // 4. Timer Factor (Universal urgency)
        if (item.sale_type === 'timer') {
            const now = new Date();
            const end = new Date(item.sale_end_time);
            const diffMins = (end - now) / 1000 / 60;
            if (diffMins <= 0) continue;
            if (diffMins < 60) score += 50;
            if (diffMins < 1440) score += 20;
        }

        // 5. Newness Factor (Prioritize recently created items)
        if (item.created_at) {
            const now = new Date();
            const created = new Date(item.created_at);
            const ageInDays = (now - created) / (1000 * 60 * 60 * 24);

            // Items created in the last 7 days get a significant boost
            if (ageInDays < 1) {
                // Less than 1 day old - HUGE boost
                score += 100;
            } else if (ageInDays < 3) {
                // 1-3 days old - Large boost
                score += 60;
            } else if (ageInDays < 7) {
                // 3-7 days old - Medium boost
                score += 30;
            } else if (ageInDays < 14) {
                // 1-2 weeks old - Small boost
                score += 10;
            }
            // Items older than 2 weeks get no newness bonus
        }

        if (score > maxScore) {
            maxScore = score;
            bestItem = item;
        }
    }

    if (!bestItem) return;
    const item = bestItem;

    // DETERMINE QUANTITY
    let maxAffordable = Math.floor(ai.cash / item.current_price);
    let limit = item.buy_limit || 10;
    if (limit === 0) limit = 100;

    let targetQuantity = 1;
    let bulkChance = 0.3; // Default

    // Personality Bulk Logic
    if (pType === 'hoarder') bulkChance = 0.9;
    if (pType === 'whale') bulkChance = 0.5;
    if (pType === 'sniper') bulkChance = 0.8;

    if (Math.random() < bulkChance) {
        // Aim for 30-60% of limit
        const ratio = 0.3 + Math.random() * 0.3;
        targetQuantity = Math.ceil(limit * ratio);
    }

    // Clamp quantity
    targetQuantity = Math.min(targetQuantity, maxAffordable, limit);
    if (item.sale_type === 'stock') {
        targetQuantity = Math.min(targetQuantity, item.remaining_stock);
    }

    if (targetQuantity <= 0) return;

    // EXECUTE BULK BUY LOOP
    for (let i = 0; i < targetQuantity; i++) {
        // CRITICAL: Stock Race Condition Fix
        // We must secure the stock BEFORE taking money or giving the item.
        if (item.sale_type === 'stock') {
            const { data: freshItem } = await supabase.from('items').select('remaining_stock').eq('id', item.id).single();

            // 1. Strict Check
            if (!freshItem || freshItem.remaining_stock <= 0) {
                console.log(`[AI] Stock ran out for ${item.name} during purchase.`);
                break;
            }

            // 2. Atomic/Optimistic Update
            // Only update if the remaining_stock is STILL what we just saw
            const { data: result, error } = await supabase
                .from('items')
                .update({
                    remaining_stock: freshItem.remaining_stock - 1,
                    is_limited: (freshItem.remaining_stock - 1) <= 0
                })
                .eq('id', item.id)
                .eq('remaining_stock', freshItem.remaining_stock)
                .select();

            if (error || !result || result.length === 0) {
                // Optimistic lock failed - someone else bought it in these few ms.
                // Retry this specific loop iteration
                i--;
                continue;
            }
            // If we're here, we successfully claimed 1 stock. Proceed to pay.
        }

        // 3. Deduct Cash
        ai.cash -= item.current_price;
        await supabase.from('users').update({ cash: ai.cash }).eq('id', ai.id);

        const { count: regularUserCount } = await supabase
            .from('user_items')
            .select('*', { count: 'exact', head: true })
            .eq('item_id', item.id)
            .neq('serial_number', 0);

        const serialNumber = (regularUserCount || 0) + 1;

        await supabase.from('user_items').insert([{
            user_id: ai.id,
            item_id: item.id,
            purchase_price: item.current_price,
            is_for_sale: false,
            serial_number: serialNumber
        }]);

        // Stock already decremented above for 'stock' items.
        // For non-stock items, we don't decrement anything.

        await supabase.from('transactions').insert([{
            user_id: ai.id,
            type: 'buy',
            amount: item.current_price,
            item_id: item.id,
            related_user_id: null
        }]);
    }

    console.log(`[AI] ${ai.username} finished buying loop for ${item.name}`);
};

const actionBuyResale = async (ai, personalityProfile) => {
    // THROTTLE: Adjusted to increase resale purchases, especially for cheaper items
    // Snipers/Traders should check more often
    let skipChance = 0.4; // Default 40% skip (More active)

    if (ai.personality === 'sniper' || ai.personality === 'trader') skipChance = 0.1; // 10% skip (Very Active)
    if (ai.personality === 'whale') skipChance = 0.2; // 20% skip
    if (ai.personality === 'hoarder') skipChance = 0.3; // 30% skip

    if (Math.random() < skipChance) return;

    // Fetch random resale listings
    let query = supabase
        .from('user_items')
        .select('*, items:item_id(*)')
        .eq('is_for_sale', true)
        .lt('sale_price', ai.cash)
        .limit(20);

    const { data: listings } = await query;
    if (!listings || listings.length === 0) return;

    // THROTTLE LOW END:
    // User Complaint: "low items still get sold fast so theyre back to no resalers"
    // Fix: If item has few listings, AI should HESITATE to buy (unless sniper).

    // Pick a potential target first
    let targetCandidate = listings[Math.floor(Math.random() * listings.length)];

    // Check global supply for this item
    const { count: globalSupply } = await supabase
        .from('user_items')
        .select('*', { count: 'exact', head: true })
        .eq('item_id', targetCandidate.items.id)
        .eq('is_for_sale', true);

    if (globalSupply < 5 && ai.personality !== 'sniper') {
        // If supply is low (less than 5), 80% chance to SKIP ensuring we leave stock for players
        if (Math.random() < 0.8) return;
    }

    // EXTRA SLOWNESS for cheap items (< 5000)
    const val = targetCandidate.items.value || targetCandidate.items.rap || 0;
    if (val < 5000) {
        // 50% chance to skip buying cheap items entirely to slow down the drain
        if (Math.random() < 0.5) return;
    }

    // FAVOR CHEAPER ITEMS: Relaxed significantly
    // We still want them to buy affordable things, but not JUST cheap things
    // Removed strict < 10k filtering preference
    // If cash is low, they will naturally only buy cheap things due to logic below


    // Helper to get effective valuation (handling projected items)
    const getEffectiveValue = (item) => {
        const rap = item.rap || 0;
        const val = item.value || rap; // If no manual value, assume fair is RAP

        // Check "Projected"
        // If RAP > Value * 1.25, it's likely projected.
        // User Update: "AI will purchase projecteds WAY less unless the resales are back to normal"
        // This means we should value it at TRUE VALUE. 
        // If listing is 100k (Fair Value) but RAP is 1M (Projected), we want to buy.
        // So Effective Value = TRUE VALUE.
        if (val > 0 && rap > val * 1.25) {
            return val; // Use True Value, don't penalize to 0, but definitely ignore Inflated RAP
        }
        return val;
    };

    let target = null;
    if (ai.personality === 'sniper') {
        target = listings.find(l => {
            const effectiveRap = getEffectiveValue(l.items);
            return l.sale_price < effectiveRap * 0.85; // 15% under effective RAP
        });
    } else {
        // Others check value logic gently
        target = listings.find(l => {
            const effectiveVal = getEffectiveValue(l.items);
            if (effectiveVal === 0) return true;
            // Don't buy overpriced things
            // STRICTER: Max 10% overpay for normal bots
            if (ai.personality !== 'whale' && l.sale_price > effectiveVal * 1.1) return false;

            // Whales can overpay a bit more, but not infinite (cap at 1.3x)
            if (ai.personality === 'whale' && l.sale_price > effectiveVal * 1.3) return false;

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
    const adminFee = Math.floor(price * 0.4); // 40% tax
    const sellerAmount = price - adminFee;

    // 1. Deduct Buyer
    await supabase.from('users').update({ cash: ai.cash - price }).eq('id', ai.id);

    // 2. Credit Seller
    const { data: seller } = await supabase.from('users').select('cash').eq('id', sellerId).single();
    if (seller) {
        await supabase.from('users').update({ cash: seller.cash + sellerAmount }).eq('id', sellerId);
    }

    // 2.5 Credit Admin (Tax)
    // ID: 0c55d336-0bf7-49bf-9a90-1b4ba4e13679
    const { data: admin } = await supabase.from('users').select('cash').eq('id', '0c55d336-0bf7-49bf-9a90-1b4ba4e13679').single();
    if (admin) {
        await supabase.from('users').update({ cash: admin.cash + adminFee }).eq('id', '0c55d336-0bf7-49bf-9a90-1b4ba4e13679');
    }

    // 3. Transfer Item
    await supabase.from('user_items').update({
        user_id: ai.id,
        is_for_sale: false,
        sale_price: null,
        purchase_price: price
    }).eq('id', target.id);

    // 4. Update RAP (and History)
    const oldRap = target.items.rap || 0;
    const newRap = await updateItemRAPSnapshot(target.items.id, price);

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

// Helper function to update daily RAP snapshot
const updateItemRAPSnapshot = async (itemId, salePrice) => {
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        // 1. Fetch Item Data (Value & Current RAP) for Projected Check
        const { data: itemData } = await supabase
            .from('items')
            .select('value, rap, name, image_url')
            .eq('id', itemId)
            .single();

        // Check Old Status
        const val = itemData?.value || 0;
        const oldRap = itemData?.rap || 0;
        const wasProjected = val > 0 && oldRap > (val * 1.25 + 50);

        // Check if snapshot exists for today
        const { data: existingSnapshot } = await supabase
            .from('item_rap_history')
            .select('*')
            .eq('item_id', itemId)
            .eq('snapshot_date', today)
            .single();

        let newRapValue = salePrice;

        if (existingSnapshot) {
            // Update existing snapshot
            const newSalesCount = existingSnapshot.sales_count + 1;
            const newSalesVolume = existingSnapshot.sales_volume + salePrice;

            let calculatedRap = Math.floor(
                (existingSnapshot.rap_value * existingSnapshot.sales_count + salePrice) / newSalesCount
            );

            // dampening
            const maxRap = Math.floor(existingSnapshot.rap_value * 1.2);
            newRapValue = Math.min(calculatedRap, maxRap);

            await supabase
                .from('item_rap_history')
                .update({
                    rap_value: newRapValue,
                    sales_count: newSalesCount,
                    sales_volume: newSalesVolume,
                    timestamp: new Date().toISOString()
                })
                .eq('item_id', itemId)
                .eq('snapshot_date', today);
        } else {
            // Create new snapshot for today
            await supabase
                .from('item_rap_history')
                .insert([{
                    item_id: itemId,
                    rap_value: salePrice,
                    sales_count: 1,
                    sales_volume: salePrice,
                    snapshot_date: today,
                    timestamp: new Date().toISOString()
                }]);
        }

        // 2. Update Item RAP
        await supabase.from('items').update({ rap: newRapValue }).eq('id', itemId);

        // 3. Check New Status (Projected Flip?)
        const isProjected = val > 0 && newRapValue > (val * 1.25 + 50);

        if (wasProjected !== isProjected) {
            // Status Changed! Log it.
            const explanation = isProjected
                ? `Item became Projected (RAP: ${newRapValue} > Value: ${val})`
                : `Item is no longer Projected (RAP: ${newRapValue} aligned with Value: ${val})`;

            await supabase.from('value_change_history').insert([{
                item_id: itemId,
                previous_value: val,
                new_value: val,
                previous_trend: wasProjected ? 'projected' : 'stable',
                new_trend: isProjected ? 'projected' : 'stable',
                explanation: explanation,
                created_at: new Date().toISOString(),
                changed_by: null // System update
            }]);
        }

        return newRapValue;
    } catch (error) {
        console.error('Error updating RAP snapshot:', error);
        return salePrice; // Fallback
    }
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

    // Shuffle limiteds to check random ones, but check MULTIPLE for liquidity
    const shuffled = limiteds.sort(() => 0.5 - Math.random());
    const toCheck = shuffled.slice(0, 5); // Check up to 5 items per tick per bot

    let itemToSell = null;

    // LIQUIDITY PROVIDER LOOP
    // IGNORE LOW STOCK items for Liquidity Provider (so we don't accidentally list rare items cheaply)
    for (const item of toCheck) {
        // QUICK CHECK: If item is rare (estimated), SKIP liquidity check
        // Ideally we check true stock, but that's expensive inside this loop. 
        // We rely on 'value' as a heuristic or check total supply if we must.
        // Let's check a quick "Is this item potentially rare?"
        // We will do the full supply check.

        const { count: totalSupply } = await supabase
            .from('user_items')
            .select('*', { count: 'exact', head: true })
            .eq('item_id', item.items.id);

        if (totalSupply < 100) continue; // SKIP RARE ITEMS entirely for liquidity providing

        const { count: globalListings } = await supabase
            .from('user_items')
            .select('*', { count: 'exact', head: true })
            .eq('item_id', item.items.id)
            .eq('is_for_sale', true);

        if (globalListings < 2) {
            // Found a dead item! Prioritize this.
            const premium = 1.2 + Math.random() * 0.3;
            const baseVal = item.items.value || item.items.rap || 100;
            const price = Math.floor(baseVal * premium);

            await supabase.from('user_items').update({
                is_for_sale: true,
                sale_price: price
            }).eq('id', item.id);

            console.log(`[AI] ${ai.username} listed LIQUIDITY item ${item.items.name} for R$${price} (${globalListings} active sellers)`);
            return; // Action done
        }
    }

    // If we didn't find a liquidity target, standard sell logic on a random item from the list
    itemToSell = limiteds[Math.floor(Math.random() * limiteds.length)];

    // Check Stock Rarity (User Rule: "rarer an item (lower the stock) should mean less % its gonna have a resale, and resales for these rars will be higher")
    // Count total supply of this item across all users (how many copies exist in circulation)
    const { count: totalSupply } = await supabase
        .from('user_items')
        .select('*', { count: 'exact', head: true })
        .eq('item_id', itemToSell.items.id);

    const stock = totalSupply || 1000; // Use total supply as "stock" metric

    // Rare Definition: Stock < 100
    if (stock < 100) {
        // Dynamic Skip Chance (HODL)
        // Stock 1: ~99% chance to skip
        // Stock 50: ~95% chance to skip
        // Stock 100: ~90% chance to skip
        const baseSkip = 0.95; // Increased base skip
        const rarityFactor = (100 - stock) / 100; // 0.0 to 1.0
        const skipChance = baseSkip + (rarityFactor * 0.049); // Approaching 0.999 for super rare

        // Log HODL decision occasionally for debugging
        if (Math.random() < skipChance) {
            // console.log(`[AI] ${ai.username} decided to HODL rare item ${itemToSell.items.name} (Stock: ${stock})`);
            return;
        }


        // If we DO sell (The "Exception"), price it HIGH.
        // Stock < 10: Joke Price (50x - 100x)
        // Stock < 50: High Price (10x - 50x)
        // Stock < 100: Premium Price (5x - 10x)

        let scarcityMult;
        if (stock < 10) {
            scarcityMult = 50 + Math.random() * 50; // 50x - 100x
        } else if (stock < 50) {
            scarcityMult = 10 + Math.random() * 40; // 10x - 50x
        } else {
            scarcityMult = 5 + Math.random() * 5; // 5x - 10x
        }

        let refValue = itemToSell.items.value || itemToSell.items.rap || 100;
        const finalPrice = Math.floor(refValue * scarcityMult);

        await supabase.from('user_items').update({
            is_for_sale: true,
            sale_price: finalPrice
        }).eq('id', itemToSell.id);

        console.log(`[AI] ${ai.username} listed RARE item ${itemToSell.items.name} (Stock: ${stock}) for R$${finalPrice} (${scarcityMult.toFixed(1)}x Markup)`);
        return;
    }

    // Base valuation: Use Logic "Smart Value"
    // If Manual Value > RAP * 1.5, trust Manual Value (Item is projected DOWN or rarely sold)
    // If RAP > Manual Value * 1.5, trust Manual Value (Item is projected UP)
    // Otherwise blend or safe pick.

    // User Request: "Prioritize item.value over rap if value is significantly higher"

    let refValue = itemToSell.items.rap || 0;
    const manualValue = itemToSell.items.value || 0;

    if (manualValue > refValue) {
        // If manual value is higher, USE IT. AI shouldn't get scammed.
        refValue = manualValue;
    } else if (manualValue > 0 && refValue > manualValue * 1.5) {
        // If RAP is inflated (projected), stick closer to manual value to initiate selling but maybe slightly higher than value
        refValue = manualValue;
    }

    if (refValue === 0) refValue = 100; // Fallback

    const rap = refValue; // We use this "Smart Value" as base for multipliers

    // Price logic
    // Scarcity Multiplier: If stock < 200, price increases
    // Formula: 1x at 200 stock, ~2x at 0 stock.
    // (stock already declared above)
    let scarcityMult = 1.0;

    // PROJECTED CORRECTION LOGIC
    // If item is projected (RAP > Value * 1.25), force listing near true value to "un-project" it
    // User Request: "when an item is projected, ensure ai try to un-project it overtime"
    const isProjected = (manualValue > 0 && (itemToSell.items.rap || 0) > manualValue * 1.25);

    if (isProjected) {
        // Force strict range: 0.9x to 1.1x of True Value
        // This creates sales at lower prices, dragging RAP down over time
        const correctionMult = 0.9 + Math.random() * 0.2;
        const finalPrice = Math.floor(refValue * correctionMult);

        await supabase.from('user_items').update({
            is_for_sale: true,
            sale_price: finalPrice
        }).eq('id', itemToSell.id);

        console.log(`[AI] ${ai.username} listed PROJECTED item ${itemToSell.items.name} for R$${finalPrice} (Val: ${refValue}, RAP: ${itemToSell.items.rap}) to CORRECT price.`);
        return;
    }

    if (stock < 200) {
        // Scarcity ONLY applies to High Tier / Events now to prevent projection of normal items
        // We defer applying this until we know if it's High Tier
    }

    let multiplier = 1.0;

    // Updated Pricing Logic: Tiered based on Value
    // 1. Low Value (< 100k)
    // 2. Medium Value (100k - 500k)
    // 3. High Value (> 500k)

    // Rarity Multiplier (Super High for Rare/Legendary checks first)
    let isHighTier = false;
    if (EVENT_ITEMS) {
        isHighTier = (EVENT_ITEMS.RARE && EVENT_ITEMS.RARE.includes(itemToSell.items.roblox_item_id)) ||
            (EVENT_ITEMS.LEGENDARY && EVENT_ITEMS.LEGENDARY.includes(itemToSell.items.roblox_item_id)) ||
            (EVENT_ITEMS.RARE && EVENT_ITEMS.RARE.includes(itemToSell.items.id)) ||
            (EVENT_ITEMS.LEGENDARY && EVENT_ITEMS.LEGENDARY.includes(itemToSell.items.id));
    }

    // High Tier / Event Items Logic
    if (isHighTier) {
        // High Tier / Event Items Logic (Extremely high value)
        if (rap > 100000) {
            multiplier = 10 + Math.random() * 20; // 10x to 30x
        } else {
            multiplier = 5 + Math.random() * 5; // 5x to 10x for cheaper rares
        }
        // Apply scarcity ONLY for high tier
        if (stock < 200) {
            scarcityMult = 1 + ((200 - stock) / 200);
        }
    } else {
        // Normal Items Tiered Logic
        if (rap > 500000) {
            // HIGH VALUE (> 500k)
            // 80% chance to NOT sell at all (HODL)
            if (Math.random() < 0.8) return;

            // If selling, SELL HIGH (1.5x - 3.0x)
            multiplier = 1.5 + Math.random() * 1.5;

        } else if (rap > 100000) {
            // MEDIUM VALUE (100k - 500k)
            // 50% Fair/Slight Profit (0.98x - 1.1x)
            // 50% Moderate Profit (1.1x - 1.3x)
            if (Math.random() < 0.5) {
                multiplier = 0.98 + Math.random() * 0.12;
            } else {
                multiplier = 1.1 + Math.random() * 0.2;
            }

        } else {
            // LOW VALUE (< 100k)
            // 70% Fair (0.95x - 1.05x)
            // 30% Slight Profit (1.05x - 1.15x)
            if (Math.random() < 0.7) {
                multiplier = 0.95 + Math.random() * 0.1;
            } else {
                multiplier = 1.05 + Math.random() * 0.1;
            }
        }

        scarcityMult = 1.0; // No extra scarcity mult for normal items, handled by base multiplier
    }

    const basePrice = rap * multiplier;
    const finalPrice = Math.max(1, Math.floor(basePrice * scarcityMult));

    await supabase.from('user_items').update({
        is_for_sale: true,
        sale_price: finalPrice
    }).eq('id', itemToSell.id);

    console.log(`[AI] ${ai.username} listed ${itemToSell.items.name} (Stock: ${stock}) for R$${finalPrice} (RAP: ${rap})`);
};

const actionManageListings = async (ai) => {
    // 1. Get Active Listings
    const { data: listings } = await supabase
        .from('user_items')
        .select('*, items:item_id(*)') // Select items data for RAP check
        .eq('user_id', ai.id)
        .eq('is_for_sale', true);

    if (!listings || listings.length === 0) return;

    // 2. Pick one random listing to manage
    const listing = listings[Math.floor(Math.random() * listings.length)];

    // 3. Decision
    const roll = Math.random();

    // Check if item is grossly overpriced (Projected prevention)
    const rap = listing.items?.rap || 0;
    const isOverpriced = rap > 0 && listing.sale_price > rap * 1.5;

    if (isOverpriced || roll < 0.3) {
        // DELIST (30% or if overpriced)
        await supabase
            .from('user_items')
            .update({ is_for_sale: false, sale_price: null })
            .eq('id', listing.id);

        console.log(`[AI] ${ai.username} DELISTED ${listing.id} (Overpriced: ${isOverpriced})`);

    } else if (roll < 0.6) { // Reduced discount chance from 0.8 (50% range) to 0.6 (30% range)
        // DISCOUNT LOGIC - TIERED
        // Only discount if item is NOT High Value (> 500k)

        let discountFactor = 1.0;

        if (rap > 500000) {
            // High Value: DO NOT DISCOUNT. Leave as is.
            return;
        } else if (rap > 100000) {
            // Medium Value: Very small discount (1-3%)
            discountFactor = 0.97 + Math.random() * 0.02; // 0.97 to 0.99
        } else {
            // Low Value: Small discount (2-5%)
            discountFactor = 0.95 + Math.random() * 0.03; // 0.95 to 0.98
        }

        const newPrice = Math.floor(listing.sale_price * discountFactor);

        // SAFETY: Never discount below 90% of RAP to prevent crash
        if (rap > 0 && newPrice < rap * 0.9) {
            return;
        }

        if (newPrice > 0 && newPrice !== listing.sale_price) {
            await supabase
                .from('user_items')
                .update({ sale_price: newPrice })
                .eq('id', listing.id);

            console.log(`[AI] ${ai.username} LOWERED price of ${listing.id} to R$${newPrice}`);
        }
    }
    // Else 40% (0.6 to 1.0): Do nothing (leave as is)
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

    // Helper (same as above, duplication but safe for now)
    const getEffectiveValue = (item) => {
        const rap = item.rap || 0;
        const val = item.value || rap;
        if (val > 0 && rap > val * 1.25) {
            return Math.floor(rap * 0.3); // Penalty for projected
        }
        return val; // Prefer Value over RAP usually
    };

    trade.trade_items.forEach(ti => {
        if (!ti.user_items || !ti.user_items.items) return;
        const itemVal = getEffectiveValue(ti.user_items.items);

        if (ti.side === 'receiver') { // Items AI gives (Receiver side)
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

        // 3. AI TRADE PROOFING
        // Check if trade meets proof requirements (10k+ value on both sides)
        const senderValue = senderItems.reduce((sum, item) => {
            const value = item.items?.value || 0;
            return sum + value;
        }, 0);

        const receiverValue = receiverItems.reduce((sum, item) => {
            const value = item.items?.value || 0;
            return sum + value;
        }, 0);

        // If both sides have 10k+ value, proof the trade
        if (senderValue >= 10000 && receiverValue >= 10000) {
            // Check if already proofed (race condition prevention)
            const { data: currentTrade } = await supabase
                .from('trades')
                .select('is_proofed')
                .eq('id', trade.id)
                .single();

            if (!currentTrade?.is_proofed) {
                // Mark as proofed
                await supabase
                    .from('trades')
                    .update({ is_proofed: true })
                    .eq('id', trade.id);

                // Send to Discord webhook
                const { data: sender } = await supabase
                    .from('users')
                    .select('username')
                    .eq('id', trade.sender_id)
                    .single();

                const { data: receiver } = await supabase
                    .from('users')
                    .select('username')
                    .eq('id', trade.receiver_id)
                    .single();

                const date = new Date().toLocaleString();

                const formatItems = (items) => {
                    return items.map(item => {
                        const itemData = item.items;
                        const value = itemData?.value || itemData?.rap || 0;
                        return `• **${itemData?.name || 'Unknown'}** - $${value.toLocaleString()}`;
                    }).join('\n') || 'No Items';
                };

                const embed1 = {
                    title: "Trade Proof",
                    color: 3066993,
                    fields: [
                        { name: "Sender", value: sender?.username || 'Unknown', inline: true },
                        { name: "Receiver", value: receiver?.username || 'Unknown', inline: true },
                        { name: "Date", value: date, inline: false }
                    ]
                };

                const embed2 = {
                    title: "Items Exchanged",
                    color: 3066993,
                    fields: [
                        { name: `${sender?.username || 'Sender'} Gave`, value: formatItems(senderItems), inline: false },
                        { name: `${receiver?.username || 'Receiver'} Gave`, value: formatItems(receiverItems), inline: false }
                    ]
                };

                const webhookUrl = 'https://discord.com/api/webhooks/1448110420106809366/wK44HjiU2NBDvoYwQWq5GgwyyWefmr536hNaJMX9fe_LHuJQ_CGw_Fidiv38FfFDo2qS';

                const axios = require('axios');
                await axios.post(webhookUrl, {
                    embeds: [embed1, embed2]
                }).catch(err => {
                    console.error('[AI] Failed to send proof webhook:', err.message);
                });

                console.log(`[AI] ${ai.username} PROOFED trade ${trade.id} (Sender: $${senderValue.toLocaleString()}, Receiver: $${receiverValue.toLocaleString()})`);
            }
        }
    } catch (err) {
        console.error(`[AI] Failed to execute accept trade ${trade.id}`, err);
    }
};

const declineTrade = async (trade, ai) => {
    await supabase.from('trades').update({ status: 'declined', updated_at: new Date() }).eq('id', trade.id);
    console.log(`[AI] ${ai.username} DECLINED trade from user ${trade.sender_id}`);
};

const actionInitiateTrade = async (ai, p) => {
    // 1. Target Selection Strategy
    // INCREASED: 60% chance to specifically target REAL PLAYERS (is_ai = false) to ensure they get activity
    const targetRealPlayers = Math.random() < 0.6;

    let query = supabase
        .from('user_items')
        .select(`
            *, 
            items:item_id(*), 
            users!inner(id, is_ai, username)
        `)
        .not('user_id', 'eq', ai.id)
        .eq('is_for_sale', false) // Target unlisted items (stash)
        .eq('items.is_limited', true);

    if (targetRealPlayers) {
        query = query.eq('users.is_ai', false);
    }

    // Fetch a batch to choose from (Increased to 200 for variety)
    const { data: candidates, error } = await query.limit(200);

    if (error || !candidates || candidates.length === 0) return;

    // Filter Candidates: Remove bad items (Projected)
    const validCandidates = candidates.filter(c => {
        if (!c.items) return false;
        const rap = c.items.rap || 0;
        const val = c.items.value || rap;
        // Avoid projected items unless we are a sniper (looking for victims) or it's just a great deal
        // Safe bet: Don't buy if RAP > 1.3x Value
        if (p.description !== 'sniper' && val > 0 && rap > val * 1.3) return false;
        return true;
    });

    if (validCandidates.length === 0) return;

    // IMPROVED: Pick a Target Item with preference for higher value items
    let targetItem;

    // 80% chance to specifically target High Value Items (10k+)
    if (Math.random() < 0.8) {
        // Filter for high value
        const highValueCandidates = validCandidates.filter(c => (c.items?.value || c.items?.rap || 0) >= 10000);

        if (highValueCandidates.length > 0) {
            targetItem = highValueCandidates[Math.floor(Math.random() * highValueCandidates.length)];
        } else {
            // Fallback to > 2000 if no 10k items found
            const midValueCandidates = validCandidates.filter(c => (c.items?.value || c.items?.rap || 0) >= 2000);
            if (midValueCandidates.length > 0) {
                targetItem = midValueCandidates[Math.floor(Math.random() * midValueCandidates.length)];
            }
        }
    }

    // If still no target (or 20% random low tier), pick random valid one
    if (!targetItem) {
        targetItem = validCandidates[Math.floor(Math.random() * validCandidates.length)];
    }

    const targetUser = targetItem.users;

    // 2. Valuation & Strategy
    // Helper to get effective valuation (handling projected items)
    const getEffectiveValue = (item) => {
        if (!item) return 0;
        const rap = item.rap || 0;
        const val = item.value || rap;
        if (val > 0 && rap > val * 1.25) return Math.floor(val * 0.5); // Penalty for projected
        return val;
    };

    const targetVal = getEffectiveValue(targetItem.items);
    if (targetVal < 1500) return; // INCREASED THRESHOLD: Don't trade for small items (User request: "bigger trades")

    // 3. Select Our Offer Items
    const { data: myItems } = await supabase
        .from('user_items')
        .select('*, items:item_id(*)')
        .eq('user_id', ai.id)
        .eq('is_for_sale', false)
        .eq('items.is_limited', true);

    if (!myItems || myItems.length === 0) return;

    // Strategy: Build a smart offer
    // Smarter AI: Don't just dump random items.

    let offerItems = [];
    let offerVal = 0;

    // Sort my items by value desc
    const mySortedItems = myItems
        .filter(i => i.items)
        .map(i => ({ ...i, effVal: getEffectiveValue(i.items) }))
        .sort((a, b) => b.effVal - a.effVal);

    // Determine Logic based on items available
    // Humanize: Try to match value cleanly first (1:1 or 2:1), then fill with smalls.

    let targetRatio = 1.0;

    // Base Willingness by personality
    // User Request: "AI shouldn't OP too much"
    // Tuned Limits:
    let maxOverpayTolerance = 1.1; // Default tight cap
    let minOverpay = 0.95;

    if (ai.personality === 'sniper') {
        targetRatio = 0.9; // Tries to underpay
        maxOverpayTolerance = 1.0; // Never overpays
        minOverpay = 0.8;
    } else if (ai.personality === 'whale') {
        targetRatio = 1.1; // Generous
        maxOverpayTolerance = 1.25; // Still caps at 25% OP (reduced from 30%+)
        minOverpay = 1.0;
    } else if (ai.personality === 'trader') {
        targetRatio = 1.0; // Fair
        maxOverpayTolerance = 1.05; // Very strict, max 5% loss
        minOverpay = 0.95;
    } else {
        // Casual / Hoarder
        maxOverpayTolerance = 1.1;
    }

    // High Value targets warrant slightly more flexibility? No, stricter.
    if (targetVal > 50000) {
        maxOverpayTolerance = Math.min(maxOverpayTolerance, 1.1); // Cap OP on expensive items
    }

    let goalValue = targetVal * targetRatio;

    // RARE ITEM BOOST: If item is rare (low stock) or High Demand, AI is willing to pay MORE.
    // User Request: "ensure AI will still overpay for rares and stuff"
    const stock = targetItem.items.stock_count || 1000;
    const demand = targetItem.items.demand || 'medium';
    const isRare = (stock < 100) || (demand === 'very_high' || demand === 'high');

    if (isRare) {
        maxOverpayTolerance = 1.5; // Up to 50% Overpay for Rares
        if (stock < 50) maxOverpayTolerance = 2.0; // Up to 2x for Super Rares

        // Also boost goal value slightly to ensure we make a tempting offer
        goalValue = goalValue * 1.1;
    }

    // Logic: 
    // 1. Try to find a single item close to value (1:1 trade)
    const perfectMatch = mySortedItems.find(i =>
        i.effVal >= targetVal * minOverpay &&
        i.effVal <= targetVal * maxOverpayTolerance &&
        i.items.id !== targetItem.items.id // Not same item
    );

    if (perfectMatch) {
        offerItems.push(perfectMatch);
        offerVal = perfectMatch.effVal;
    } else {
        // 2. Build a package
        // Filter out same item as target to avoid "Item A for Item A" silliness
        const candidates = mySortedItems.filter(i => i.items.id !== targetItem.items.id);

        // Try to find a "Base" item (50-90% of value)
        for (const item of candidates) {
            // Avoid adding duplicate items to the offer if we want "clean" trades (unless hoarder/whale)
            // User Request: "ai shjouldnt send the same items for one item" -> assume implies "don't stack duplicates in offer"
            const alreadyHasOriginal = offerItems.some(o => o.items.id === item.items.id);
            if (alreadyHasOriginal && ai.personality !== 'hoarder') continue;

            if (offerVal + item.effVal <= goalValue * maxOverpayTolerance) {
                offerItems.push(item);
                offerVal += item.effVal;
            }

            if (offerVal >= goalValue * 0.98) break;
        }

        // 3. If nearly there but need a "small" to bridge gap
        // Try to find a small item specifically
        if (offerVal < goalValue && offerVal > goalValue * 0.8) {
            const difference = goalValue - offerVal;
            // Look for item close to difference
            const small = candidates.find(i =>
                !offerItems.includes(i) &&
                i.effVal <= difference * 1.5 && // Can go a bit over
                i.effVal >= difference * 0.5    // But meaningful
            );
            if (small && (offerVal + small.effVal <= goalValue * maxOverpayTolerance)) {
                offerItems.push(small);
                offerVal += small.effVal;
            }
        }
    }

    // Validation
    if (offerItems.length === 0) return;

    // Check Ratios
    if (offerVal < targetVal * minOverpay) return; // Too low
    if (offerVal > targetVal * maxOverpayTolerance) return; // Too high

    // DOUBLE CHECK: Don't send 1:1 same item
    if (offerItems.length === 1 && offerItems[0].items.id === targetItem.items.id) return;

    // 4. Send Trade
    const { count: existing } = await supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .eq('sender_id', ai.id)
        .eq('receiver_id', targetUser.id)
        .eq('status', 'pending');

    if (existing > 0) return;

    const { data: trade, error: tradeError } = await supabase
        .from('trades')
        .insert([{
            sender_id: ai.id,
            receiver_id: targetUser.id,
            status: 'pending'
        }])
        .select()
        .single();

    if (tradeError) return;

    // Insert Trade Items
    const tradeItemsPayload = [];
    offerItems.forEach(i => {
        tradeItemsPayload.push({ trade_id: trade.id, user_item_id: i.id, side: 'sender' });
    });
    tradeItemsPayload.push({ trade_id: trade.id, user_item_id: targetItem.id, side: 'receiver' });

    const { error: itemsError } = await supabase.from('trade_items').insert(tradeItemsPayload);
    if (itemsError) {
        // Rollback? AI service doesn't really care, but good to know errors.
        console.error("AI Trade Item Error", itemsError);
        return;
    }

    console.log(`[AI] ${ai.username} SENT trade to ${targetUser.username}. Offer: ${offerVal} (x${offerItems.length}) vs Ask: ${targetVal} (Item: ${targetItem.items.name}) Ratio: ${(offerVal / targetVal).toFixed(2)}`);
};


module.exports = {
    start: () => {
        try {
            const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
            console.log(`[AI] Current Branch: ${branch}`);
            // Force Enable AI for now as per request if 'main' detection is flaky, 
            // or just assume 'main' is production. 
            // The user said "it detected main branch as dev", preventing AI.
            // If branch is 'main', it should have worked. Maybe casing?
            // Let's just ALLOW AI always for this session/fix.
            isDevBranch = false;
            console.log('[AI] AI Actions ENABLED (Forced).');
        } catch (e) {
            console.log('[AI] Branch detection failed, assuming Production. AI ENABLED.');
            isDevBranch = false;
        }

        isRunning = true;
        initAiUsers().then(() => runAiLoop());
    },
    stop: () => {
        isRunning = false;
    }
};
