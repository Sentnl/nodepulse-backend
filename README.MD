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
docker run -d \
  --name nodepulse-backend \
  -e VIRTUAL_HOST=your-domain.com \
  -e VIRTUAL_PORT=3000 \
  --network nginx-proxy \
  nodepulse-backend
```

Make sure to replace `your-domain.com` with your actual domain name.

Note: This assumes you have already set up the nginx-proxy container and created a Docker network named `nginx-proxy`. If you haven't, you'll need to do that first.


