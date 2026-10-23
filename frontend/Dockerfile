FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY tools/package.json ./tools/package.json
RUN npm ci --ignore-scripts
COPY frontend ./frontend
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/frontend ./frontend
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "frontend", "--", "--hostname", "0.0.0.0"]
