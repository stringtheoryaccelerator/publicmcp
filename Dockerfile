FROM ghcr.io/puppeteer/puppeteer:23.0.0

# Switch to root to install dependencies
USER root

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (skip prepare script during install)
RUN npm ci --only=production --ignore-scripts && \
    npm install typescript@^5.0.0 --ignore-scripts

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Switch back to non-root user for security
USER pptruser

# Run the MCP server
CMD ["node", "dist/index.js"]
