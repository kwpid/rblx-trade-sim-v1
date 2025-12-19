const axios = require('axios');

/**
 * Send a Discord webhook message with embeds
 * Automatically proxies through hooks.hyra.io to avoid Discord rate limits on shared hosting (Render)
 * @param {string} webhookUrl - Discord webhook URL
 * @param {Object|Object[]} embeds - Single embed object or array of embeds
 */
async function sendDiscordWebhook(webhookUrl, embeds) {
  if (!webhookUrl || !webhookUrl.trim()) {
    console.log('[Discord-Util] Webhook skipped: No URL provided.');
    return;
  }

  // Ensure embeds is an array
  const embedArray = Array.isArray(embeds) ? embeds : [embeds];
  if (embedArray.length === 0) return;

  // PROXY LOGIC: Replace discord.com with hooks.hyra.io
  // This is a common practice to avoid 429 Errors (Too Many Requests / 1015 Cloudflare)
  const proxiedUrl = webhookUrl.replace('discord.com', 'hooks.hyra.io');

  try {
    const response = await axios.post(proxiedUrl, {
      embeds: embedArray
    });
    console.log(`[Discord-Util] Sent to ${proxiedUrl}. Status: ${response.status}`);
    return response;
  } catch (error) {
    // If it's a 429 via proxy, we really are hitting it hard, but usually hyra handles this beautifully.
    console.error('[Discord-Util] FAILED:', error.response?.status, error.response?.data || error.message);
    // Don't throw - webhook failures shouldn't break the app
  }
}

/**
 * Create embed for item release
 */
function createItemReleaseEmbed(item) {
  const stockInfo = item.sale_type === 'stock'
    ? `Stock: ${item.stock_count || 0}`
    : `Timer: ${item.timer_duration || 0} minutes`;

  return {
    title: item.name,
    description: item.description || 'No description',
    color: 0x00b06f, // Green color
    thumbnail: {
      url: item.image_url || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`
    },
    fields: [
      {
        name: 'Original Price',
        value: `R$${item.initial_price?.toLocaleString() || 0}`,
        inline: true
      },
      {
        name: 'Sale Type',
        value: item.sale_type === 'stock' ? 'Stock' : 'Timer',
        inline: true
      },
      {
        name: stockInfo.split(':')[0],
        value: stockInfo.split(':')[1]?.trim() || 'N/A',
        inline: true
      }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'Item Release'
    }
  };
}

/**
 * Create embed for value update
 */
function createValueUpdateEmbed(item, oldValue, newValue, trend, demand, explanation, changedBy) {
  const valueChange = newValue - oldValue;
  const valueChangePercent = oldValue > 0
    ? ((valueChange / oldValue) * 100).toFixed(1)
    : 0;

  const color = valueChange > 0 ? 0x00b06f : valueChange < 0 ? 0xff4d4d : 0xbdbebe;

  const fields = [
    {
      name: 'Previous Value',
      value: `R$${oldValue.toLocaleString()}`,
      inline: true
    },
    {
      name: 'New Value',
      value: `R$${newValue.toLocaleString()}`,
      inline: true
    },
    {
      name: 'Change',
      value: `${valueChange >= 0 ? '+' : ''}R$${valueChange.toLocaleString()} (${valueChangePercent >= 0 ? '+' : ''}${valueChangePercent}%)`,
      inline: true
    },
    {
      name: 'Trend',
      value: trend.charAt(0).toUpperCase() + trend.slice(1),
      inline: true
    },
    {
      name: 'Demand',
      value: demand.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      inline: true
    }
  ];

  if (explanation) {
    fields.push({
      name: 'Explanation',
      value: explanation,
      inline: false
    });
  }

  return {
    title: item.name,
    color: color,
    thumbnail: {
      url: item.image_url || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`
    },
    fields: fields,
    timestamp: new Date().toISOString(),
    footer: {
      text: changedBy ? `Updated by ${changedBy}` : 'Value Update'
    }
  };
}

/**
 * Create embed for big sale (100k+)
 */
function createBigSaleEmbed(item, salePrice, seller, buyer, oldRap, newRap) {
  const rapChange = newRap - oldRap;
  const rapChangePercent = oldRap > 0
    ? ((rapChange / oldRap) * 100).toFixed(1)
    : 0;

  return {
    title: '💰 Big Sale!',
    description: `${item.name} sold for R$${salePrice.toLocaleString()}`,
    color: 0xf68802, // Orange color
    thumbnail: {
      url: item.image_url || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`
    },
    fields: [
      {
        name: 'Seller',
        value: seller || 'Unknown',
        inline: true
      },
      {
        name: 'Buyer',
        value: buyer || 'Unknown',
        inline: true
      },
      {
        name: 'Sale Price',
        value: `R$${salePrice.toLocaleString()}`,
        inline: true
      },
      {
        name: 'Previous RAP',
        value: `R$${oldRap.toLocaleString()}`,
        inline: true
      },
      {
        name: 'New RAP',
        value: `R$${newRap.toLocaleString()}`,
        inline: true
      },
      {
        name: 'RAP Change',
        value: `${rapChange >= 0 ? '+' : ''}R$${rapChange.toLocaleString()} (${rapChangePercent >= 0 ? '+' : ''}${rapChangePercent}%)`,
        inline: true
      }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'Big Sale'
    }
  };
}

module.exports = {
  sendDiscordWebhook,
  createItemReleaseEmbed,
  createValueUpdateEmbed,
  createBigSaleEmbed
};

