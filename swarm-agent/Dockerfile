FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY src ./src
EXPOSE 9001
ENV AGENT_PORT=9001
CMD ["node", "src/index.js"]
