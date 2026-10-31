# SFU WebRTC video calling app

A Zoom-style group video calling starter built with **React + TypeScript + Vite**, **Node.js + TypeScript**, **Socket.IO** for signaling, and **mediasoup** as the Selective Forwarding Unit (SFU).

Features:
- Create or join a room using a room ID
- Rooms with up to ten participants
- Camera and microphone permissions
- Mute/unmute microphone
- Camera on/off
- Screen sharing
- In-call text chat
- Connection state and participant status
- Leave call
- Server-routed media through a mediasoup SFU
- Dockerfile for the signaling server

> This is a functional starter, not a production Zoom replacement. The SFU receives each participant's encrypted WebRTC uplink and forwards selected media to subscribers. For reliable calls across restrictive NATs/mobile networks, configure the SFU's public IP and a TURN server.

## Requirements

- Node.js 22+
- npm 10+
- A modern browser (Chrome, Edge, Firefox, Safari)
- HTTPS in production (camera/microphone and screen capture require a secure context; `localhost` is allowed for development)

## Run locally

```bash
npm install
cp server/.env.example server/.env
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`) in multiple browser windows/devices. Create a room in one and join with the same room ID in the others.

The signaling server runs on `http://localhost:4000`.

## Environment

`server/.env`:

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
MEDIASOUP_MIN_PORT=40000
MEDIASOUP_MAX_PORT=40100
MEDIASOUP_ANNOUNCED_IP=your.public.ip.or.dns.name
```

Optional client `.env`:

```env
VITE_SIGNALING_URL=http://localhost:4000
VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]
```

To configure TURN, set `VITE_ICE_SERVERS` to JSON such as:

```env
VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"TURN_USERNAME","credential":"TURN_PASSWORD"}]
```

Use credentials from your own TURN provider. Do not commit real TURN credentials to a public repository. For production, inject secrets at deployment time and consider a short-lived TURN credential mechanism.

## SFU and production notes

1. Deploy the signaling server and client behind HTTPS/WSS. Configure `CLIENT_ORIGIN` to the exact deployed client origin.
2. Set `MEDIASOUP_ANNOUNCED_IP` to the public address clients can reach and expose the UDP/TCP range configured by `MEDIASOUP_MIN_PORT` and `MEDIASOUP_MAX_PORT`.
3. Add a TURN service (for example, coturn or a managed TURN provider) and configure the client ICE servers. The SFU still needs reachable ICE candidates.
4. The server limits rooms to ten sockets, but room and worker state is in memory and is not shared across multiple server instances. Use a room-aware router, shared coordination, and sticky sessions when horizontally scaling.
5. Add authentication, room authorization, rate limiting, abuse reporting, logging/monitoring, and privacy/retention policies before public launch.
6. This demo has no recording, call scheduling, user accounts, or end-to-end identity verification.
7. Screen sharing is browser-dependent and generally requires HTTPS.
8. Socket.IO handles control/signaling messages; mediasoup owns WebRTC transports, producers, and consumers. Media remains encrypted in transit with DTLS-SRTP.

## Project layout

```text
client/   React + TypeScript UI
server/   TypeScript Socket.IO + mediasoup SFU server
  src/config.ts           Environment and media configuration
  src/mediaServer.ts      mediasoup worker, router, and transport helpers
  src/roomStore.ts        In-memory room and peer state
  src/roomService.ts      Room lifecycle and peer cleanup
  src/socketHandlers.ts   Socket.IO room, SFU, chat, and media handlers
  src/types.ts            Shared server event and domain types
  src/index.ts            HTTP/SFU server composition root
```

## Troubleshooting

- **No camera/microphone:** allow permissions and use `localhost` or HTTPS.
- **No remote video:** inspect browser console; verify the SFU UDP/TCP port range and `MEDIASOUP_ANNOUNCED_IP`, then configure TURN.
- **Room full:** ten participants are allowed. Leave another browser tab/session if the room is full.
- **Screen share unavailable:** use a supported desktop browser and HTTPS.
- **Can't connect from another network:** configure a reachable TURN server and verify firewall/network rules.
