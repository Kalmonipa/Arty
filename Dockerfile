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

USER node

CMD ["npm", "run", "start"]
