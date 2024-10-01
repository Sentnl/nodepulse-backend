# NodePulse Backend

Obtains and maintains a list of healthy Hyperion and Atomic nodes and makes them accessible via an API.

## Running the Server

### 1. Direct Node.js Execution
To run the server directly using Node.js:

```bash
node server.js
```

The backend will be accessible at `http://localhost:3000`

### 2. Docker Container

#### Build the Docker image
```bash
docker build -t nodepulse-backend .
```

#### Run the container

##### Standard run
```bash
docker run -p 3000:3000 nodepulse-backend
```

The backend will be accessible at `http://localhost:3000`

##### Using jwilder/nginx-proxy
If you're using jwilder/nginx-proxy for reverse proxy, use the following command:

```bash
sudo docker run  --network=proxy-net --name servername --expose 3000 \
-d -e "VIRTUAL_HOST=nodepulse.domainname.com, proxy.cloudflare.com" \
-e "LETSENCRYPT_HOST=nodepulse.domainname.com" \
-e "HTTPS_METHOD=noredirect" \
-e "LETSENCRYPT_EMAIL=user@email.com" \
nodepulse-backend:latest
```

Make sure to replace nodepulse.domainname.com  with your actual domain name for your backend AND proxy.cloudflare.com with the name of your proxy.

Note: This assumes you have already set up the nginx-proxy container and created a Docker network named `nginx-proxy`. If you haven't, you'll need to do that first.

## API Endpoints

### Health Check

The `/health` endpoint provides information about the overall health status of the NodePulse backend and the number of healthy nodes it's tracking.

To access the health information, send a GET request to:

```bash
curl http://localhost:3000/health
```

The response will be a JSON object with the following structure:

```json
{
  "version": "1.0.0",
  "status": "healthy",
  "nodes": {
    "hyperion": 5,
    "atomic": 4
  }
}
```

- `version`: The current version of the API.
- `status`: Either "healthy" or "unhealthy". The API is considered healthy if there are at least 3 healthy Hyperion nodes and 3 healthy Atomic nodes.
- `nodes`: An object containing the count of healthy Hyperion and Atomic nodes.

