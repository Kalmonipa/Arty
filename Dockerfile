FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci 

COPY src/ ./src/
COPY tsconfig.json ./

RUN npm run build &&\
 mkdir -p /app/logs &&\
 mkdir -p /app/data &&\
 chown -R node:node /app

# Declared after the build: an ARG invalidates every layer below it, so putting
# this any higher would rebuild npm ci and tsc on every version bump
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

USER node

CMD ["npm", "run", "start"]
