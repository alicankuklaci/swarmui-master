# SwarmUI Agent (Portainer-style)

SwarmUI Agent is a **secure Docker API proxy** that lets SwarmUI Master manage remote Swarm clusters.

## Deploy on target cluster

```yaml
version: '3.8'
services:
  swarmui-agent:
    image: alicankuklaci/swarmui-agent:latest
    ports:
      - "9001:9001"
    environment:
      - AGENT_TOKEN=supersecret
      - AGENT_READONLY=false
      - DOCKER_SOCKET=/var/run/docker.sock
      # Optional: IP allowlist
      # - AGENT_ALLOWED_IPS=1.2.3.4,5.6.7.8
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

## Add endpoint in SwarmUI Master

- **Type:** `agent`
- **URL:** `http://<agent-host>:9001`
- **Token:** `supersecret`

SwarmUI Master will pass the token as `Authorization: Bearer <token>`.

## Security

- `AGENT_TOKEN` (required): Bearer token
- `AGENT_ALLOWED_IPS` (optional): comma-separated allowlist
- `AGENT_READONLY=true` to block write operations

## Health

- `GET /health` → `{ ok: true }`

Everything else is proxied to the Docker Engine API via `/var/run/docker.sock`.
