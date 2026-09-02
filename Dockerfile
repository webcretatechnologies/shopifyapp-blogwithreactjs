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

# `start` runs `prisma migrate deploy` + `prisma/seed.js` before booting, so a fresh deploy
# comes up with billing plans, plan features, AI credit packs and the Super Admin already in
# place. Both steps are idempotent, so this is safe on every container restart.
CMD ["npm", "run", "start"]