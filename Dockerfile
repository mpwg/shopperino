FROM node:26.8-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY apps ./apps
COPY docs/examples ./docs/examples
COPY packages ./packages
COPY tests ./tests

CMD ["npm", "test"]
