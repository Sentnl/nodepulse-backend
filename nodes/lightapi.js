import ky from 'ky';
import dns from 'dns/promises';
import geoip from 'geoip-lite';
import { formatUrl } from '../utils/utils.js';

const checkLightApiHealth = async (node, TIMEOUT_DURATION) => {
  try {
    console.log(`Checking Light API health for node: ${node.url}`);

    const response = await ky.get(formatUrl(node.url, '/api/status'), {
      timeout: TIMEOUT_DURATION,
      throwHttpErrors: false
    });

    const responseText = (await response.text()).trim().toUpperCase();
    console.log(`Raw response from ${node.url}:`, JSON.stringify(responseText)); // Debug log
    const isHealthy = response.status === 200 && (responseText === 'OK' || responseText === 'OK %');

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

    console.log(`Node ${node.url} is unhealthy. Status: ${response.status}, Response: ${JSON.stringify(responseText)}`);
    return false;

  } catch (error) {
    console.error(`Failed to check health of Light API node ${node.url}:`, error.message);
    return false;
  }
};

export { checkLightApiHealth }; 