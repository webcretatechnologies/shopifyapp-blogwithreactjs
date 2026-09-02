FROM node:22-alpine

WORKDIR /app

# Build-time argument
ARG SHOPIFY_API_KEY

# Make it available during npm run build
ENV SHOPIFY_API_KEY=${SHOPIFY_API_KEY}

COPY web .

# Install root dependencies
RUN npm install --legacy-peer-deps

# Install frontend dependencies and build
RUN cd frontend \
    && npm install --legacy-peer-deps \
    && SHOPIFY_API_KEY=${SHOPIFY_API_KEY} npm run build

EXPOSE 3000

CMD ["npm", "run", "serve"]