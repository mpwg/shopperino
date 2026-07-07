FROM node:24.18.0-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY packages ./packages
COPY tests ./tests

CMD ["npm", "test"]
