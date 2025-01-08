import ky from 'ky';
import dns from 'dns/promises';
import geoip from 'geoip-lite';
import { formatUrl } from '../utils/utils.js';

const checkIpfsHealth = async (node, TIMEOUT_DURATION) => {
  try {
    console.log(`Checking IPFS health for node: ${node.url}`);

    const response = await ky.get(
      formatUrl(node.url, '/ipfs/QmWnfdZkwWJxabDUbimrtaweYF8u9TaESDBM8xvRxxbQxv'), 
      {
        timeout: TIMEOUT_DURATION,
        throwHttpErrors: false,
        headers: {
          'Range': 'bytes=0-0' // Request only first byte
        }
      }
    );

    const isHealthy = response.status === 200 || response.status === 206; // Accept both full response and partial content

    if (isHealthy) {
      console.log(`Node ${node.url} is healthy`);
      
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
    }

    console.log(`Node ${node.url} is unhealthy. Status: ${response.status}`);
    return false;

  } catch (error) {
    console.error(`Failed to check health of IPFS node ${node.url}:`, error.message);
    return false;
  }
};

export { checkIpfsHealth }; 