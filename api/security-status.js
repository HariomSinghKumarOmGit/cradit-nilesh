/* Vercel Serverless Function — Security Status Endpoint */
module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    airGap: false,
    encryption: "DTLS-SRTP",
    dataResidency: "RAM-only",
    activeConnections: 0,
    uptime: 0,
    serverVersion: "1.0.0",
    mode: "cloud"
  });
};
