FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci 

COPY src/ ./src/
COPY tsconfig.json ./

RUN npm run build &&\
 addgroup -g 1001 -S arty &&\
 adduser -S arty -u 1001 &&\
 chown -R arty:arty /app

USER arty

RUN mkdir /app/logs &&\
 touch /app/logs/arty.log

CMD ["npm", "run", "start"]