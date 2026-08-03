FROM node:26.5.1-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY apps ./apps
COPY docs/examples ./docs/examples
COPY packages ./packages
COPY tests ./tests

CMD ["npm", "test"]
