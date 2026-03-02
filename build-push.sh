#!/bin/bash
set -e

REGISTRY=alicankuklaci
VERSION=${1:-latest}

echo "🔨 Building backend..."
docker build --target backend \
  -t $REGISTRY/swarmui-master-backend:$VERSION \
  -t $REGISTRY/swarmui-master-backend:latest .

echo "🔨 Building frontend..."
docker build --target frontend \
  -t $REGISTRY/swarmui-master-frontend:$VERSION \
  -t $REGISTRY/swarmui-master-frontend:latest .

echo "📤 Pushing images..."
docker push $REGISTRY/swarmui-master-backend:$VERSION
docker push $REGISTRY/swarmui-master-backend:latest
docker push $REGISTRY/swarmui-master-frontend:$VERSION
docker push $REGISTRY/swarmui-master-frontend:latest

echo "✅ Done! Images pushed to Docker Hub."
