FROM node:20-bookworm-slim

# Minimal build tools required for native sqlite3 compilation
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/data /app/.baileys_auth
EXPOSE 3500

CMD ["npm", "start"]
