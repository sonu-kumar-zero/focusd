FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm install --no-save typescript @types/node @types/express @types/cors
RUN npx tsc
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
