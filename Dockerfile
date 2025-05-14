FROM node:22-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Expose port 9120
EXPOSE 9120

# Start the application with specific port
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "9120"]