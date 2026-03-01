# SwarmUI API Documentation

SwarmUI exposes a fully documented RESTful API using OpenAPI / Swagger.

## Accessing the Documentation

Once the backend is running, navigate to:
`http://<SERVER_IP>:3001/api/docs`

This Swagger UI allows you to interactive with the API endpoints.

## Authentication
Authentication is required for most endpoints and is done via JWT (`Bearer <token>`). The token is acquired by calling the `/api/v1/auth/login` endpoint.

## Health and Metrics
- **Health Check**: `/api/health`
- **Prometheus Metrics**: `/metrics`
