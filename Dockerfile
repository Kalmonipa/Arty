FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci 

COPY src/ ./src/
COPY tsconfig.json ./

RUN npm run build &&\
 addgroup -g 1000 -S arty &&\
 adduser -S arty -u 1000 &&\
 mkdir -p /app/logs &&\
 touch /app/logs/arty.log &&\
 chown -R arty:arty /app

USER arty

CMD ["npm", "run", "start"]