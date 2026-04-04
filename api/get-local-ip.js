/* Vercel Serverless Function — Local IP Endpoint (Cloud mode) */
module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // In cloud mode, there is no local IP — return the deployed URL
  const host = req.headers.host || "localhost";
  res.json({ ip: host, port: 443, mode: "cloud" });
};
