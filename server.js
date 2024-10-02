import Fastify from 'fastify';
import ky from 'ky';
import dns from 'dns/promises';
import geoip from 'geoip-lite';

const fastify = Fastify({ logger: true });

const PORT = process.env.PORT || 3000;
const HEALTH_CHECK_INTERVAL = process.env.HEALTH_CHECK_INTERVAL || 520000; // Default 520 seconds
const TIMEOUT_DURATION = process.env.TIMEOUT_DURATION || 5000;
let nextHealthCheckTime = Date.now() + HEALTH_CHECK_INTERVAL;
const NODE_LIST_REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

// Add this constant near the top of the file, with other constants
const API_VERSION = '1.0.2';

// Add this function to log the countdown
const logCountdown = () => {
    const now = Date.now();
    const timeRemaining = Math.max(0, nextHealthCheckTime - now);
    const secondsRemaining = Math.ceil(timeRemaining / 1000);
    console.log(`Time until next health check: ${secondsRemaining} seconds`);
  };


// In-memory list of healthy nodes for mainnet and testnet
let healthyNodes = {
  hyperion: {
    mainnet: [],
    testnet: []
  },
  atomic: {
    mainnet: [],
    testnet: []
  }
};

let hyperionMainnetNodes = [];
let hyperionTestnetNodes = [];
let atomicMainnetNodes = [];
let atomicTestnetNodes = [];

// Fetch list of nodes from custom URLs
const fetchNodeList = async () => {
  try {
    const fetchWithFallback = async (url) => {
      try {
        return await ky.get(`https://${url}`).json();
      } catch (error) {
        console.log(`HTTPS request failed for ${url}, falling back to HTTP`);
        return await ky.get(`http://${url}`).json();
      }
    };

    // Fetch Hyperion nodes
    const hyperionNodeList = await fetchWithFallback('wax.sengine.co/api/nodes/hyperion');
    hyperionMainnetNodes = hyperionNodeList
      .filter(node => node.network === 'mainnet')
      .map(node => ({ 
        url: node.https_node_url, 
        historyfull: node.historyfull 
      }));
    hyperionTestnetNodes = hyperionNodeList
      .filter(node => node.network === 'testnet')
      .map(node => ({ 
        url: node.https_node_url, 
        historyfull: node.historyfull 
      }));

    // Fetch Atomic nodes
    const atomicNodeList = await fetchWithFallback('wax.sengine.co/api/nodes/atomic');
    atomicMainnetNodes = atomicNodeList.filter(node => node.network === 'mainnet').map(node => ({ url: node.https_node_url }));
    atomicTestnetNodes = atomicNodeList.filter(node => node.network === 'testnet').map(node => ({ url: node.https_node_url }));

    fastify.log.info('Node list updated.');
  } catch (error) {
    fastify.log.error('Failed to fetch node list:', error);
  }
};

// Fetch the head block from nodes and get the latest one
const fetchLatestHeadBlock = async (nodes) => {
  try {
    const headBlocks = await Promise.all(nodes.slice(0, 3).map(async (node) => {
      try {
        const response = await ky.get(`${node.url}/v1/chain/get_info`, { timeout: TIMEOUT_DURATION }).json();
        console.log(`Head block number for node ${node.url}: ${response.head_block_num}`);
        return response.head_block_num;
      } catch (error) {
        fastify.log.error(`Failed to fetch head block from ${node.url}:`, error.message);
        return null;
      }
    }));
    const latestHeadBlock = Math.max(...headBlocks.filter(Boolean));
    console.log(`Latest head block number selected: ${latestHeadBlock}`);
    return latestHeadBlock;
  } catch (error) {
    fastify.log.error('Failed to fetch latest head block:', error.message);
    return null;
  }
};

// Hyperion health check function
const checkHyperionHealth = async (node, latestHeadBlock) => {
  try {
    console.log(`Checking Hyperion health for node: ${node.url}`);

    const [actionsResponse, healthResponse] = await Promise.all([
      ky.get(`${node.url}/v2/history/get_actions?limit=1`, { timeout: TIMEOUT_DURATION }).json(),
      ky.get(`${node.url}/v2/health`, { timeout: TIMEOUT_DURATION }).json()
    ]);

    const actionsData = actionsResponse;
    const healthData = healthResponse;

    // Ensure last_indexed_block_time is in UTC format
    const lastIndexedBlockTimeStr = actionsData.last_indexed_block_time;
    const lastIndexedTime = new Date(lastIndexedBlockTimeStr + 'Z').getTime();

  

    const currentTime = Date.now(); // Current time in UTC milliseconds

    // Log the time values for debugging
    //console.log(`Node ${node.url} - Last Indexed Block Time (UTC): ${new Date(lastIndexedTime).toISOString()}`);
    //console.log(`Current Time (UTC): ${new Date(currentTime).toISOString()}`);

    // Calculate the time difference in seconds
    const timeDifference = (currentTime - lastIndexedTime) / 1000; // Convert milliseconds to seconds
    //console.log(`Time difference for node ${node.url}: ${timeDifference} seconds`);

    if (timeDifference > 120) {
      console.log(`Node ${node.url} failed due to time difference greater than 120 seconds.`);
      return false;
    }

    

    // Check if all services are OK and missing_blocks is 0
    const allServicesOK = healthData.health.every(service => service.status === 'OK');
    const missingBlocks = healthData.health.find(service => service.service === 'Elasticsearch')?.service_data.missing_blocks || 0;
    //console.log(`All services OK for node ${node.url}: ${allServicesOK}, Missing blocks: ${missingBlocks}`);

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

    console.log(`Node ${node.url} is healthy.`);
    return true;
  } catch (error) {
    console.error(`Failed to check health of Hyperion node ${node.url}:`, error.message);
    return false;
  }
};

// Atomic API health check function
const checkAtomicHealth = async (node) => {
  try {
    console.log(`Checking Atomic API health for node: ${node.url}`);

    const [collectionsResponse, templatesResponse, assetsResponse, marketAssetsResponse] = await Promise.all([
      ky.get(`${node.url}/atomicassets/v1/collections/kogsofficial`, { timeout: TIMEOUT_DURATION }).json(),
      ky.get(`${node.url}/atomicassets/v1/templates?collection_name=kogsofficial&has_assets=true&page=1&limit=1&order=desc&sort=created`, { timeout: TIMEOUT_DURATION }).json(),
      ky.get(`${node.url}/atomicassets/v1/assets?page=1&limit=1&order=desc&sort=asset_id`, { timeout: TIMEOUT_DURATION }).json(),
      ky.get(`${node.url}/atomicmarket/v1/assets?owner=sentnlagents&limit=1`, { timeout: TIMEOUT_DURATION }).json()
    ]);

    const collectionsData = collectionsResponse;
    const templatesData = templatesResponse;
    const assetsData = assetsResponse;
    const marketAssetsData = marketAssetsResponse;

    node.atomic = {
      atomicassets: false,
      atomicmarket: false
    };

    // Check atomicassets
    if (collectionsData.success && templatesData.success && assetsData.success) {
      const templateId = templatesData.data[0]?.template_id;
      const assetId = assetsData.data[0]?.asset_id;

      if (templateId && assetId) {
        const [templateResponse, assetResponse] = await Promise.all([
          ky.get(`${node.url}/atomicassets/v1/templates/kogsofficial/${templateId}`, { timeout: TIMEOUT_DURATION }).json(),
          ky.get(`${node.url}/atomicassets/v1/assets/${assetId}`, { timeout: TIMEOUT_DURATION }).json()
        ]);

        if (templateResponse.success && assetResponse.success) {
          node.atomic.atomicassets = true;
        }
      }
    }

    // Check atomicmarket
    if (marketAssetsData.success && marketAssetsData.data.length > 0) {
      const marketAssetId = marketAssetsData.data[0].asset_id;
      try {
        const marketAssetResponse = await ky.get(`${node.url}/atomicmarket/v1/assets/${marketAssetId}`, { timeout: TIMEOUT_DURATION }).json();
        node.atomic.atomicmarket = marketAssetResponse.success;
      } catch (error) {
        console.error(`Failed additional atomicmarket check for node ${node.url}:`, error.message);
      }
    }

    // Node is healthy if either atomicassets or atomicmarket is available
    const isHealthy = node.atomic.atomicassets || node.atomic.atomicmarket;

    if (isHealthy) {
      console.log(`Node ${node.url} is healthy. Atomicassets: ${node.atomic.atomicassets}, Atomicmarket: ${node.atomic.atomicmarket}`);
      
      // Perform geo IP lookup here...

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

// Update health checks for all mainnet nodes
const updateHealthChecks = async () => {
  if (!hyperionMainnetNodes.length || !atomicMainnetNodes.length) {
    fastify.log.warn('Mainnet node list is empty. Fetching node list...');
    await fetchNodeList(); // Fetch node list initially if empty
  }

  // Fetch the latest head block from mainnet Hyperion nodes
  const latestHeadBlock = await fetchLatestHeadBlock(hyperionMainnetNodes);

  if (!latestHeadBlock

) {
    fastify.log.error('Failed to fetch the latest head block.');
    return;
  }

  const healthyHyperionNodes = [];
  const healthyAtomicNodes = [];

  for (const node of hyperionMainnetNodes) {
    const isHealthy = await checkHyperionHealth(node, latestHeadBlock);
    if (isHealthy) {
      healthyHyperionNodes.push(node);
    }
  }

  for (const node of atomicMainnetNodes) {
    const isHealthy = await checkAtomicHealth(node);
    if (isHealthy) {
      healthyAtomicNodes.push(node);
    }
  }

  healthyNodes.hyperion.mainnet = healthyHyperionNodes;
  healthyNodes.atomic.mainnet = healthyAtomicNodes;

  
  fastify.log.info(`Health check completed. Healthy Hyperion mainnet nodes: ${healthyHyperionNodes.length}, Healthy Atomic mainnet nodes: ${healthyAtomicNodes.length}`);
  console.log('Updated healthyNodes:', JSON.stringify(healthyNodes, null, 2));
  // Update the next health check time
  nextHealthCheckTime = Date.now() + HEALTH_CHECK_INTERVAL;
  console.log(`Next health check scheduled for: ${new Date(nextHealthCheckTime).toISOString()}`);
};

// Set up the interval for health checks
setInterval(async () => {
    await updateHealthChecks();
  }, HEALTH_CHECK_INTERVAL);
  
  // Set up a more frequent interval for logging the countdown
  setInterval(logCountdown, 10000); // Log every 10 seconds
  
  // Initial health check
  updateHealthChecks();

// Schedule daily node list refresh for both mainnet and testnet
setInterval(async () => {
  await fetchNodeList();
  await updateHealthChecks(); // Perform health checks after refreshing the node list
}, NODE_LIST_REFRESH_INTERVAL);
fetchNodeList(); // Initial fetch

// Route to get healthy nodes based on type, network, and geolocation
fastify.get('/nodes', (request, reply) => {
  const { 
    type = 'hyperion', 
    network = 'mainnet', 
    count = 3, 
    historyfull = 'true', 
    streaming = 'true',
    atomicassets = 'true',
    atomicmarket = 'true'
  } = request.query;
  const ip = request.ip;
  const userGeo = geoip.lookup(ip) || {};
  const userRegion = userGeo.region || '';
  const userCountry = userGeo.country || '';

  console.log('Request received for /nodes');
  console.log('Query parameters:', { type, network, count, historyfull, streaming, atomicassets, atomicmarket });
  console.log('User geo:', { region: userRegion, country: userCountry });

  let nodesList = healthyNodes[type][network] || [];
  console.log(`Initial nodes list for ${type} ${network}:`, nodesList);

  // Apply filters
  if (type === 'hyperion') {
    if (historyfull !== undefined) {
      nodesList = nodesList.filter(node => node.historyfull === (historyfull === 'true'));
    }
    if (streaming !== undefined) {
      nodesList = nodesList.filter(node => node.streaming?.enable === (streaming === 'true'));
    }
  } else if (type === 'atomic') {
    // Default is both atomicassets and atomicmarket are true
    const filterAtomicAssets = atomicassets !== undefined ? (atomicassets === 'true') : true;
    const filterAtomicMarket = atomicmarket !== undefined ? (atomicmarket === 'true') : true;

    nodesList = nodesList.filter(node => {
      if (filterAtomicAssets && filterAtomicMarket) {
        return node.atomic.atomicassets && node.atomic.atomicmarket;
      } else if (filterAtomicAssets) {
        return node.atomic.atomicassets;
      } else if (filterAtomicMarket) {
        return node.atomic.atomicmarket;
      }
      return true; // If neither is specified, don't filter
    });
  }

  console.log(`Filtered nodes list:`, nodesList);

  if (!nodesList.length) {
    console.log(`No healthy ${type} nodes available for ${network} with the specified filters.`);
    return reply.status(503).send({ message: `No healthy ${type} nodes available for ${network} with the specified filters.` });
  }

  // Sort nodes by proximity to user
  nodesList.sort((a, b) => {
    if (a.country === userCountry && b.country !== userCountry) return -1;
    if (b.country === userCountry && a.country !== userCountry) return 1;
    if (a.region === userRegion && b.region !== userRegion) return -1;
    if (b.region === userRegion && a.region !== userRegion) return 1;
    return 0;
  });

  // Prepare the response
  const response = nodesList.slice(0, parseInt(count, 10)).map(node => ({
    url: node.url,
    region: node.region,
    country: node.country,
    timezone: node.timezone,
    historyfull: node.historyfull,
    streaming: node.streaming,
    atomic: node.atomic
  }));

  console.log('Responding with:', response);
  reply.send(response);
});


  fastify.get('/health', (request, reply) => {
    const totalHyperionNodes = healthyNodes.hyperion.mainnet.length + healthyNodes.hyperion.testnet.length;
    const totalAtomicNodes = healthyNodes.atomic.mainnet.length + healthyNodes.atomic.testnet.length;
  
    const isHealthy = totalHyperionNodes >= 3 && totalAtomicNodes >= 3;
  
    reply.send({
      version: API_VERSION,
      status: isHealthy ? 'healthy' : 'unhealthy',
      nodes: {
        hyperion: totalHyperionNodes,
        atomic: totalAtomicNodes
      }
    });
  });

  
// Start server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`Server running at http://localhost:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();