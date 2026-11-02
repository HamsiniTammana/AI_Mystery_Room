FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm install
COPY . .
EXPOSE 4000 5173
CMD ["npm","run","dev"]
