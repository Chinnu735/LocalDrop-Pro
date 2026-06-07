const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Accept connections from local network IP addresses
    methods: ["GET", "POST"]
  }
});

// Store connected peers
const peers = new Map();

io.on('connection', (socket) => {
  console.log(`[+] Peer connected: ${socket.id}`);

  // When a peer joins, they send their device info (OS, browser, etc.)
  socket.on('join', (deviceInfo) => {
    const peerData = { id: socket.id, ...deviceInfo };
    peers.set(socket.id, peerData);
    
    // Send the current list of peers to the new peer
    const otherPeers = Array.from(peers.values()).filter(p => p.id !== socket.id);
    socket.emit('current_peers', otherPeers);

    // Broadcast to everyone else that a new peer joined
    socket.broadcast.emit('peer_joined', peerData);
  });

  // WebRTC Signaling: Offer
  socket.on('webrtc_offer', ({ targetId, offer }) => {
    io.to(targetId).emit('webrtc_offer', {
      senderId: socket.id,
      offer
    });
  });

  // WebRTC Signaling: Answer
  socket.on('webrtc_answer', ({ targetId, answer }) => {
    io.to(targetId).emit('webrtc_answer', {
      senderId: socket.id,
      answer
    });
  });

  // WebRTC Signaling: ICE Candidate
  socket.on('webrtc_ice_candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('webrtc_ice_candidate', {
      senderId: socket.id,
      candidate
    });
  });

  socket.on('disconnect', () => {
    console.log(`[-] Peer disconnected: ${socket.id}`);
    peers.delete(socket.id);
    io.emit('peer_left', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Signaling server running on port ${PORT}`);
  console.log(`Any device on your Wi-Fi can connect via your PC's local IP address.`);
});
