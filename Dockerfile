FROM node:14

WORKDIR /viscoin

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 80 9332 9333

RUN npm run c

CMD [ "node", "fullnode.js" ]