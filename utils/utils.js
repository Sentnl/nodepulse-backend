const formatUrl = (baseUrl, path) => {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${base}${path}`;
  };
  
  export { formatUrl };