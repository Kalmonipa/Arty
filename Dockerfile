FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY src/ ./src/
COPY tsconfig.json ./

RUN npm run build

EXPOSE 3000

RUN addgroup -g 1001 -S arty
RUN adduser -S arty -u 1001

RUN chown -R arty:arty /app
USER arty

CMD ["npm", "run", "start"]