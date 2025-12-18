const supabase = require('../config/supabase');
const axios = require('axios');

// Helper function to update daily RAP snapshot
const updateItemRAPSnapshot = async (itemId, salePrice) => {
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        // Check if snapshot exists for today
        const { data: existingSnapshot } = await supabase
            .from('item_rap_history')
            .select('*')
            .eq('item_id', itemId)
            .eq('snapshot_date', today)
            .single();

        if (existingSnapshot) {
            // Update existing snapshot
            const newSalesCount = existingSnapshot.sales_count + 1;
            const newSalesVolume = existingSnapshot.sales_volume + salePrice;

            // Calculate new average RAP
            let calculatedRap = Math.floor(
                (existingSnapshot.rap_value * existingSnapshot.sales_count + salePrice) / newSalesCount
            );

            // dampening: max 20% increase from previous daily snapshot RAP
            const maxRap = Math.floor(existingSnapshot.rap_value * 1.2);

            const newRapValue = Math.min(calculatedRap, maxRap);

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

            return newRapValue;
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

            return salePrice;
        }
    } catch (error) {
        console.error('Error updating RAP snapshot:', error);
        throw error;
    }
};

// Check if projection status changed and fire webhook
const checkProjectionStatus = async (item, oldValue, newValue, oldRap, newRap) => {
    try {
        // Current Logic: Projected if RAP > Value * 1.25 + 50 AND Value > 0
        const rap = newRap !== undefined ? newRap : (item.rap || 0);
        const value = newValue !== undefined ? newValue : (item.value || 0);

        const wasProjected = (oldValue || item.value) > 0 && (oldRap || item.rap) > ((oldValue || item.value) * 1.25 + 50);
        const isProjected = value > 0 && rap > (value * 1.25 + 50);

        if (wasProjected !== isProjected) {
            // Status Changed
            await sendProjectionWebhook(item, isProjected, value, rap);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error checking projection status:', error);
        return false;
    }
};

const sendProjectionWebhook = async (item, isProjected, value, rap) => {
    try {
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL_VALUES; // Reuse value webhook or separate?
        if (!webhookUrl) return;

        const statusText = isProjected ? "PROJECTED" : "NORMALIZED";
        const color = isProjected ? 15158332 : 3066993; // Red or Green

        // Calculate Project %
        const ratio = value > 0 ? ((rap - value) / value) * 100 : 0;

        const embed = {
            title: `Projection Status Update: ${item.name}`,
            thumbnail: { url: item.image_url },
            color: color,
            fields: [
                { name: "Status", value: `**${statusText}**`, inline: true },
                { name: "RAP", value: `R$${rap.toLocaleString()}`, inline: true },
                { name: "Value", value: `R$${value.toLocaleString()}`, inline: true },
                { name: "Diff", value: `${ratio.toFixed(1)}%`, inline: true }
            ],
            timestamp: new Date().toISOString()
        };

        await axios.post(webhookUrl, { embeds: [embed] });
        console.log(`[Economy] Projection webhook sent for ${item.name}: ${statusText}`);

    } catch (error) {
        console.error('Error sending projection webhook:', error);
    }
};

module.exports = {
    updateItemRAPSnapshot,
    checkProjectionStatus,
    sendProjectionWebhook
};
