import ky from 'ky';

const TIMEOUT_DURATION = 5000; // 5 seconds timeout

const testEndpoints = async (baseUrl = 'https://atomic.sentnl.io') => {
  const endpoints = [
    '/atomicassets/v1/collections/kogsofficial',
    '/atomicassets/v1/templates?collection_name=kogsofficial&has_assets=true&page=1&limit=1&order=desc&sort=created',
    '/atomicassets/v1/assets?page=1&limit=1&order=desc&sort=asset_id',
    '/atomicmarket/v1/assets?owner=sentnlagents&limit=1'
  ];

  let allTestsPassed = true;

  for (const endpoint of endpoints) {
    try {
      await ky.get(`${baseUrl}${endpoint}`, { timeout: TIMEOUT_DURATION }).json();
      console.log(`Endpoint: ${endpoint} - Success`);
    } catch (error) {
      console.error(`Error for endpoint ${endpoint}:`, error.message);
      allTestsPassed = false;
    }
  }

  // Test additional endpoints that depend on the responses from previous requests
  try {
    const templatesResponse = await ky.get(`${baseUrl}/atomicassets/v1/templates?collection_name=kogsofficial&has_assets=true&page=1&limit=1&order=desc&sort=created`, { timeout: TIMEOUT_DURATION }).json();
    const assetsResponse = await ky.get(`${baseUrl}/atomicassets/v1/assets?page=1&limit=1&order=desc&sort=asset_id`, { timeout: TIMEOUT_DURATION }).json();
    const marketAssetsResponse = await ky.get(`${baseUrl}/atomicmarket/v1/assets?owner=sentnlagents&limit=1`, { timeout: TIMEOUT_DURATION }).json();

    const templateId = templatesResponse.data[0]?.template_id;
    const assetId = assetsResponse.data[0]?.asset_id;
    const marketAssetId = marketAssetsResponse.data[0]?.asset_id;

    if (templateId) {
      await ky.get(`${baseUrl}/atomicassets/v1/templates/kogsofficial/${templateId}`, { timeout: TIMEOUT_DURATION }).json();
      console.log(`Endpoint: /atomicassets/v1/templates/kogsofficial/${templateId} - Success`);
    }

    if (assetId) {
      await ky.get(`${baseUrl}/atomicassets/v1/assets/${assetId}`, { timeout: TIMEOUT_DURATION }).json();
      console.log(`Endpoint: /atomicassets/v1/assets/${assetId} - Success`);
    }

    if (marketAssetId) {
      await ky.get(`${baseUrl}/atomicmarket/v1/assets/${marketAssetId}`, { timeout: TIMEOUT_DURATION }).json();
      console.log(`Endpoint: /atomicmarket/v1/assets/${marketAssetId} - Success`);
    }
  } catch (error) {
    console.error('Error in additional endpoints:', error.message);
    allTestsPassed = false;
  }

  console.log(`\nAll tests passed: ${allTestsPassed}`);
  return allTestsPassed;
};

// Usage
const baseUrl = 'https://wax.api.atomicassets.io'; // Replace with the actual base URL you want to test
testEndpoints(baseUrl);