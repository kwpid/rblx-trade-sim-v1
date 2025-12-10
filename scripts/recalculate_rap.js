require('dotenv').config();
const supabase = require('../server/config/supabase');

async function recalculateRap() {
    try {
        console.log('Fetching all items...');
        const { data: items, error: itemsError } = await supabase
            .from('items')
            .select('id, name');

        if (itemsError) throw itemsError;

        console.log(`Found ${items.length} items. Calculating RAP...`);

        for (const item of items) {
            // Get last 10 sales
            const { data: history, error: historyError } = await supabase
                .from('item_rap_history')
                .select('rap_value')
                .eq('item_id', item.id)
                .order('timestamp', { ascending: false })
                .limit(10);

            if (historyError) {
                console.error(`Error fetching history for ${item.name}:`, historyError);
                continue;
            }

            if (history && history.length > 0) {
                const totalRap = history.reduce((sum, record) => sum + record.rap_value, 0);
                const avgRap = Math.floor(totalRap / history.length);

                console.log(`Updating ${item.name}: RAP = ${avgRap} (from ${history.length} sales)`);

                await supabase
                    .from('items')
                    .update({
                        value: avgRap,
                        value_updated_at: new Date().toISOString()
                    })
                    .eq('id', item.id);
            } else {
                console.log(`No sales history for ${item.name}. Skipping.`);
            }
        }

        console.log('RAP recalculation complete!');
        process.exit(0);
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

recalculateRap();
