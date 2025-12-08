const axios = require('axios');

const ROLIMONS_API_BASE = 'https://www.rolimons.com/api';

async function getItemDetails(itemId) {
  try {
    // First try Roblox Catalog API for item details
    const catalogResponse = await axios.get(`https://catalog.roblox.com/v1/catalog/items/${itemId}/details`, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    
    if (catalogResponse.data) {
      return {
        name: catalogResponse.data.name || 'Unknown Item',
        description: catalogResponse.data.description || '',
        imageUrl: `https://www.roblox.com/asset-thumbnail/image?assetId=${itemId}&width=420&height=420&format=png`,
        rap: 0,
        value: 0,
        demand: 0,
        trend: 0
      };
    }
  } catch (error) {
    console.log('Catalog API failed, trying alternatives...');
  }

  // Fallback: Try Roblox Economy API
  try {
    const economyResponse = await axios.get(`https://economy.roblox.com/v2/assets/${itemId}/details`, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    
    if (economyResponse.data) {
      return {
        name: economyResponse.data.Name || 'Unknown Item',
        description: economyResponse.data.Description || '',
        imageUrl: `https://www.roblox.com/asset-thumbnail/image?assetId=${itemId}&width=420&height=420&format=png`,
        rap: 0,
        value: 0,
        demand: 0,
        trend: 0
      };
    }
  } catch (error) {
    console.log('Economy API failed, using basic info...');
  }

  // Final fallback: Use basic Roblox thumbnail URL and generic name
  return {
    name: `Item ${itemId}`,
    description: 'Item description not available',
    imageUrl: `https://www.roblox.com/asset-thumbnail/image?assetId=${itemId}&width=420&height=420&format=png`,
    rap: 0,
    value: 0,
    demand: 0,
    trend: 0
  };
}

module.exports = { getItemDetails };

