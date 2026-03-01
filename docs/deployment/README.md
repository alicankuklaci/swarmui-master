# Deployment Guide

SwarmUI is designed to be deployed directly onto a Docker Swarm manager node.

## Prerequisites
- A Docker Swarm cluster (manager node)
- Docker Compose installed

## Deployment

1. Create a `docker-compose.prod.yml` (or use the one provided)
2. Create `.env.prod` with production variables (JWT secrets, strong passwords).
3. Deploy the stack:
   ```bash
   docker stack deploy -c docker-compose.prod.yml swarmui
   ```

## Secrets
Ensure `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are securely generated and kept safe.
