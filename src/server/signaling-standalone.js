/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SENTINOID ECO — STANDALONE SIGNALING SERVER
   Deploy this to Render.com / Railway / Glitch for free.
   This is the matchmaking relay — it never touches user files.
   
   To deploy on Render.com (free):
   1. Create a new Web Service
   2. Point to this repo (or create a separate one)
   3. Set Build Command: npm install
   4. Set Start Command: node src/server/signaling-standalone.js
   5. The server will get a URL like: https://sentinoid-eco-signal.onrender.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "sentinoid-eco-signaling" }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Sentinoid ECO Signaling Server");
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let activeConnections = 0;

io.on("connection", (socket) => {
  activeConnections++;
  console.log("🟢 User connected:", socket.id, `(${activeConnections} active)`);

  socket.on("join-room", (code) => {
    const room = io.sockets.adapter.rooms.get(code);
    const size = room ? room.size : 0;

    if (size >= 2) {
      socket.emit("room-full");
      console.log(`⛔ ${socket.id} tried to join full room: ${code}`);
      return;
    }

    socket.join(code);
    socket.currentRoom = code;
    console.log(`🏠 ${socket.id} joined room: ${code} (size now: ${size + 1})`);

    if (size === 1) {
      socket.emit("ready");
      socket.to(code).emit("peer-joined");
    }
  });

  socket.on("offer", ({ code, data }) => socket.to(code).emit("offer", data));
  socket.on("answer", ({ code, data }) => socket.to(code).emit("answer", data));
  socket.on("ice-candidate", ({ code, data }) =>
    socket.to(code).emit("ice-candidate", data)
  );

  socket.on("disconnect", () => {
    activeConnections = Math.max(0, activeConnections - 1);
    console.log("🔴 User disconnected:", socket.id, `(${activeConnections} active)`);
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit("peer-left");
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n=========================================`);
  console.log(`🛡️  Sentinoid ECO Signaling Server`);
  console.log(`=========================================`);
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`=========================================\n`);
});
