FROM node:20-alpine AS builder

# sharp compiles a native C++ addon against libvips at npm install time — needs build tools + headers
RUN apk add --no-cache python3 make g++ vips-dev

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner

RUN apk add --no-cache vips

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/main"]
