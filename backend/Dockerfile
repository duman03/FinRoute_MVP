FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json nodemon.json ./
COPY src/ ./src/
COPY migrations/ ./migrations/
COPY scripts/ ./scripts/

EXPOSE 3001

CMD ["npx", "nodemon"]
