import ky from 'ky';
import dns from 'dns/promises';
import geoip from 'geoip-lite';
import { formatUrl } from '../utils/utils.js';

const checkAtomicHealth = async (node, TIMEOUT_DURATION) => {
  try {
    console.log(`Checking Atomic API health for node: ${node.url}`);

    const [collectionsResponse, templatesResponse, assetsResponse, marketAssetsResponse] = await Promise.all([
      ky.get(formatUrl(node.url, '/atomicassets/v1/collections/kogsofficial'), { timeout: TIMEOUT_DURATION }).json(),
      ky.get(formatUrl(node.url, '/atomicassets/v1/templates?collection_name=kogsofficial&has_assets=true&page=1&limit=1&order=desc&sort=created'), { timeout: TIMEOUT_DURATION }).json(),
      ky.get(formatUrl(node.url, '/atomicassets/v1/assets?page=1&limit=1&order=desc&sort=asset_id'), { timeout: TIMEOUT_DURATION }).json(),
      ky.get(formatUrl(node.url, '/atomicmarket/v1/assets?owner=sentnlagents&limit=1'), { timeout: TIMEOUT_DURATION }).json()
    ]);

    console.log(`Node ${node.url} - Initial API calls successful`);

    const collectionsData = collectionsResponse;
    const templatesData = templatesResponse;
    const assetsData = assetsResponse;
    const marketAssetsData = marketAssetsResponse;

    node.atomic = {
      atomicassets: false,
      atomicmarket: false
    };

    // Check atomicassets
    console.log(`Node ${node.url} - Checking atomicassets`);
    if (collectionsData.success && templatesData.success && assetsData.success) {
      console.log(`Node ${node.url} - Collections, templates, and assets data retrieved successfully`);
      const templateId = templatesData.data[0]?.template_id;
      const assetId = assetsData.data[0]?.asset_id;

      if (templateId && assetId) {
        console.log(`Node ${node.url} - Template ID: ${templateId}, Asset ID: ${assetId}`);
        const [templateResponse, assetResponse] = await Promise.all([
          ky.get(formatUrl(node.url, `/atomicassets/v1/templates/kogsofficial/${templateId}`), { timeout: TIMEOUT_DURATION }).json(),
          ky.get(formatUrl(node.url, `/atomicassets/v1/assets/${assetId}`), { timeout: TIMEOUT_DURATION }).json()
        ]);

        if (templateResponse.success && assetResponse.success) {
          node.atomic.atomicassets = true;
          console.log(`Node ${node.url} - atomicassets check passed`);
        } else {
          console.log(`Node ${node.url} - atomicassets check failed. Template success: ${templateResponse.success}, Asset success: ${assetResponse.success}`);
        }
      } else {
        console.log(`Node ${node.url} - atomicassets check failed. No template ID or asset ID found`);
      }
    } else {
      console.log(`Node ${node.url} - atomicassets check failed. Collections success: ${collectionsData.success}, Templates success: ${templatesData.success}, Assets success: ${assetsData.success}`);
    }

    // Check atomicmarket
    console.log(`Node ${node.url} - Checking atomicmarket`);
    if (marketAssetsData.success && marketAssetsData.data.length > 0) {
      const marketAssetId = marketAssetsData.data[0].asset_id;
      console.log(`Node ${node.url} - Market Asset ID: ${marketAssetId}`);
      try {
        const marketAssetResponse = await ky.get(formatUrl(node.url, `/atomicmarket/v1/assets/${marketAssetId}`), { timeout: TIMEOUT_DURATION }).json();
        node.atomic.atomicmarket = marketAssetResponse.success;
        console.log(`Node ${node.url} - atomicmarket check ${node.atomic.atomicmarket ? 'passed' : 'failed'}`);
      } catch (error) {
        console.error(`Node ${node.url} - Failed additional atomicmarket check:`, error.message);
      }
    } else {
      console.log(`Node ${node.url} - atomicmarket check failed. Market assets data success: ${marketAssetsData.success}, Data length: ${marketAssetsData.data.length}`);
    }

    // Node is healthy if either atomicassets or atomicmarket is available
    const isHealthy = node.atomic.atomicassets || node.atomic.atomicmarket;

    if (isHealthy) {
      console.log(`Node ${node.url} is healthy. Atomicassets: ${node.atomic.atomicassets}, Atomicmarket: ${node.atomic.atomicmarket}`);
      
      // Perform geo IP lookup
      const nodeHostname = new URL(node.url).hostname;
      try {
        const nodeIp = await dns.lookup(nodeHostname);
        const geo = geoip.lookup(nodeIp.address) || {};
        node.region = geo.region || 'unknown';
        node.country = geo.country || 'unknown';
        node.timezone = geo.timezone || 'unknown';
        console.log(`Node ${node.url} geo info: Region: ${node.region}, Country: ${node.country}, Timezone: ${node.timezone}`);
      } catch (dnsError) {
        console.error(`Failed to perform DNS lookup for ${nodeHostname}:`, dnsError.message);
        node.region = 'unknown';
        node.country = 'unknown';
        node.timezone = 'unknown';
      }

      return true;
    } else {
      console.log(`Node ${node.url} is unhealthy. Neither atomicassets nor atomicmarket are available.`);
      return false;
    }

  } catch (error) {
    console.error(`Failed to check health of Atomic node ${node.url}:`, error.message);
    return false;
  }
};

export { checkAtomicHealth };