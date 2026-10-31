# Two-person WebRTC video calling app

A Zoom-style, one-to-one video calling starter built with **React + TypeScript + Vite**, **Node.js + TypeScript**, **Socket.IO** for signaling, and browser-native **WebRTC** for audio/video.

Features:
- Create or join a room using a room ID
- Two-person room limit
- Camera and microphone permissions
- Mute/unmute microphone
- Camera on/off
- Screen sharing
- In-call text chat
- Connection state and participant status
- Leave call
- Configurable STUN/TURN servers
- Dockerfile for the signaling server

> This is a functional starter, not a production Zoom replacement. WebRTC media normally travels peer-to-peer; the Node server only exchanges signaling messages. For reliable calls across restrictive NATs/mobile networks, configure a TURN server. The included public STUN server is for development and is not a guaranteed production service.

## Requirements

- Node.js 20+
- npm 10+
- A modern browser (Chrome, Edge, Firefox, Safari)
- HTTPS in production (camera/microphone and screen capture require a secure context; `localhost` is allowed for development)

## Run locally

```bash
npm install
cp server/.env.example server/.env
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`) in two browser windows/devices. Create a room in one and join with the same room ID in the other.

The signaling server runs on `http://localhost:4000`.

## Environment

`server/.env`:

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
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

## Production notes

1. Deploy the signaling server and client behind HTTPS/WSS. Configure `CLIENT_ORIGIN` to the exact deployed client origin.
2. Add a TURN service (for example, coturn or a managed TURN provider). Without TURN, some users will fail to connect.
3. The server limits rooms to two sockets but this in-memory state is not shared across multiple server instances. Use sticky sessions/shared coordination if horizontally scaling.
4. Add authentication, room authorization, rate limiting, abuse reporting, logging/monitoring, and privacy/retention policies before public launch.
5. This demo has no recording, call scheduling, user accounts, or end-to-end identity verification.
6. Screen sharing is browser-dependent and generally requires HTTPS.
7. Socket.IO signaling is not the media path. The browser establishes an encrypted WebRTC peer connection (DTLS-SRTP).

## Project layout

```text
client/   React + TypeScript UI
server/   TypeScript Socket.IO signaling server
```

## Troubleshooting

- **No camera/microphone:** allow permissions and use `localhost` or HTTPS.
- **No remote video:** inspect browser console; verify both peers joined the same room and configure TURN.
- **Room full:** only two participants are allowed. Leave the other browser tab/session.
- **Screen share unavailable:** use a supported desktop browser and HTTPS.
- **Can't connect from another network:** configure a reachable TURN server and verify firewall/network rules.
