FROM node:20-slim

# Install dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm install typescript@^5.0.0

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Run the MCP server
CMD ["node", "dist/index.js"]
