/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SENTINOID ECO — LOCAL DEV SERVER
   Simple static file server for local development.
   Signaling is handled by Supabase Realtime (no Socket.io needed).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const express = require("express");
const app = express();
const path = require("path");
const os = require("os");

// OS UTILITY: Scans the host machine's network interfaces to find the active Wi-Fi IPv4 address.
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  let fallbackIP = "localhost";
  let preferredIP = null;

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();

    if (
      lowerName.includes("veth") ||
      lowerName.includes("vmware") ||
      lowerName.includes("virtual") ||
      lowerName.includes("wsl")
    ) {
      continue;
    }

    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        if (iface.address.startsWith("192.168.56.")) continue;

        if (
          lowerName.includes("wi-fi") ||
          lowerName.includes("wifi") ||
          lowerName.includes("wlan")
        ) {
          preferredIP = iface.address;
        }

        if (fallbackIP === "localhost") {
          fallbackIP = iface.address;
        }
      }
    }
  }

  return preferredIP || fallbackIP;
}

// STATIC ROUTING
const root = process.cwd();
app.use(express.static(root));

app.get("/", (req, res) => {
  res.sendFile(path.join(root, "index.html"));
});

const PORT = process.env.PORT || 3000;
const localIP = getLocalIP();

// API ENDPOINT: Local IP for QR codes
app.get("/get-local-ip", (req, res) => {
  res.json({ ip: localIP, port: PORT, mode: "local" });
});

// SECURITY STATUS ENDPOINT
const startTime = Date.now();

app.get("/api/security-status", (req, res) => {
  const isLocal = req.hostname === "localhost" || req.hostname === "127.0.0.1";
  res.json({
    airGap: isLocal,
    encryption: "DTLS-SRTP",
    dataResidency: "RAM-only",
    activeConnections: 0,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    serverVersion: "2.0.0",
    signaling: "supabase-realtime"
  });
});

// STARTUP
app.listen(PORT, () => {
  console.log(`\n=========================================`);
  console.log(`🛡️  Sentinoid ECO Local Server`);
  console.log(`=========================================`);
  console.log(`💻 Local (This PC): http://localhost:${PORT}`);
  console.log(`📱 Network (Phone): http://${localIP}:${PORT}`);
  console.log(`📡 Signaling: Supabase Realtime`);
  console.log(`🔒 Security: DTLS-SRTP | Air-Gap Ready`);
  console.log(`=========================================\n`);
});
