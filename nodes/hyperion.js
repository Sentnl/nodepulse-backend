import ky from 'ky';
import dns from 'dns/promises';
import geoip from 'geoip-lite';
import { formatUrl } from '../utils/utils.js';

const checkHyperionHealth = async (node, TIMEOUT_DURATION) => {
  try {
    console.log(`Checking Hyperion health for node: ${node.url}`);

    const [actionsResponse, healthResponse] = await Promise.all([
      ky.get(formatUrl(node.url, '/v2/history/get_actions?limit=1'), { timeout: TIMEOUT_DURATION }).json(),
      ky.get(formatUrl(node.url, '/v2/health'), { timeout: TIMEOUT_DURATION }).json()
    ]);

    const actionsData = actionsResponse;
    const healthData = healthResponse;

    // Ensure last_indexed_block_time is in UTC format
    const lastIndexedBlockTimeStr = actionsData.last_indexed_block_time;
    const lastIndexedTime = new Date(lastIndexedBlockTimeStr + 'Z').getTime();

    const currentTime = Date.now(); // Current time in UTC milliseconds

    // Calculate the time difference in seconds
    const timeDifference = (currentTime - lastIndexedTime) / 1000; // Convert milliseconds to seconds

    if (timeDifference > 120) {
      console.log(`Node ${node.url} failed due to time difference greater than 120 seconds.`);
      return false;
    }

    // Check if all services are OK and missing_blocks is 0
    const allServicesOK = healthData.health.every(service => service.status === 'OK');
    const missingBlocks = healthData.health.find(service => service.service === 'Elasticsearch')?.service_data.missing_blocks || 0;

    if (allServicesOK && missingBlocks === 0) {
      // Extract streaming features
      const streamingFeatures = healthData.features?.streaming || {};
      node.streaming = {
        enable: streamingFeatures.enable || false,
        traces: streamingFeatures.traces || false,
        deltas: streamingFeatures.deltas || false
      };

      // Perform geo IP lookup
      const nodeHostname = new URL(node.url).hostname;
      try {
        const nodeIp = await dns.lookup(nodeHostname);
        const geo = geoip.lookup(nodeIp.address) || {};
        node.region = geo.region || 'unknown';
        node.country = geo.country || 'unknown';
        node.timezone = geo.timezone || 'unknown';
        console.log(`Node ${node.url} is healthy. Region: ${node.region}, Country: ${node.country}`);
      } catch (dnsError) {
        console.error(`Failed to perform DNS lookup for ${nodeHostname}:`, dnsError.message);
        node.region = 'unknown';
        node.country = 'unknown';
        node.timezone = 'unknown';
      }
      return true;
    }

    console.log(`Node ${node.url} is unhealthy.`);
    return false;
  } catch (error) {
    console.error(`Failed to check health of Hyperion node ${node.url}:`, error.message);
    return false;
  }
};

export { checkHyperionHealth };