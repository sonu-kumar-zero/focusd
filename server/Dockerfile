FROM node:22-bookworm-slim

# mediasoup uses a native worker. Debian's glibc runtime supports its
# prebuilt worker; these tools also allow the package to build it when a
# matching prebuild is unavailable.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    cmake \
    g++ \
    gcc \
    git \
    make \
    ninja-build \
    pkg-config \
    python3 \
    python3-pip \
  && ln -s /usr/bin/python3 /usr/local/bin/python \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm install --no-save typescript @types/node @types/express @types/cors
RUN npx tsc
ENV NODE_ENV=production
EXPOSE 4000 40000-40100/udp 40000-40100/tcp
CMD ["node", "dist/index.js"]
