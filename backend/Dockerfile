FROM node:20-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=false
COPY tsconfig.json ./
COPY src ./src
RUN yarn build
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
