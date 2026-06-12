require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;

/* -------------------- Middleware -------------------- */

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

/* -------------------- MongoDB -------------------- */

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

function getMongoStatus() {
  const state = mongoose.connection.readyState;

  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  return states[state] || "unknown";
}

/* -------------------- Log Schema -------------------- */

const logSchema = new mongoose.Schema(
  {
    type: String,
    method: String,
    url: String,
    request: Object,
    response: Object,
    error: Object,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { strict: false },
);

logSchema.index({ timestamp: -1 });
logSchema.index({ type: 1 });

const Log = mongoose.model("Log", logSchema);

/* -------------------- Logger -------------------- */

async function saveLog(data) {
  try {
    await Log.create(data);
  } catch (err) {
    console.error("Logging Error:", err.message);
  }
}

/* -------------------- Health -------------------- */

app.get("/health", async (req, res) => {
  const healthData = {
    status: "UP",
    mongo: getMongoStatus(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
  };

  await saveLog({
    type: "health",
    method: "GET",
    url: "/health",
    response: healthData,
  });

  res.json(healthData);
});

/* -------------------- Stats -------------------- */

app.get("/stats", async (req, res) => {
  try {
    const [totalLogs, apiLogs, webhookLogs, healthLogs, errorLogs] =
      await Promise.all([
        Log.countDocuments(),
        Log.countDocuments({ type: "api" }),
        Log.countDocuments({ type: "webhook" }),
        Log.countDocuments({ type: "health" }),
        Log.countDocuments({
          error: { $exists: true },
        }),
      ]);

    res.json({
      server: "UP",
      mongo: getMongoStatus(),
      uptimeSeconds: process.uptime(),
      totalLogs,
      apiLogs,
      webhookLogs,
      healthLogs,
      errorLogs,
      memory: process.memoryUsage(),
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/* -------------------- Logs APIs -------------------- */

app.get("/logs", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 50);

    const logs = await Log.find()
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Log.countDocuments();

    res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: logs,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

app.get("/logs/search", async (req, res) => {
  try {
    const { type, method } = req.query;

    const filter = {};

    if (type) filter.type = type;
    if (method) filter.method = method;

    const logs = await Log.find(filter).sort({ timestamp: -1 }).limit(100);

    res.json(logs);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

app.get("/logs/:id", async (req, res) => {
  try {
    const log = await Log.findById(req.params.id);

    if (!log) {
      return res.status(404).json({
        message: "Log not found",
      });
    }

    res.json(log);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

app.delete("/logs", async (req, res) => {
  try {
    const result = await Log.deleteMany({});

    res.json({
      success: true,
      deleted: result.deletedCount,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/* -------------------- Dashboard -------------------- */

app.get("/dashboard", (req, res) => {
  res.send(`

<!DOCTYPE html>

<html>
<head>
<title>Logs Dashboard</title>

<style>
body{
  background:#121212;
  color:white;
  font-family:Arial;
  padding:20px;
}

.card{
  background:#222;
  padding:15px;
  margin-bottom:20px;
  border-radius:10px;
}

table{
  width:100%;
  border-collapse:collapse;
}

th,td{
  border:1px solid #444;
  padding:10px;
}

th{
  background:#333;
}

button{
  padding:8px 12px;
  cursor:pointer;
}

#payloadModal{
  display:none;
  position:fixed;
  top:5%;
  left:5%;
  width:90%;
  height:85%;
  background:#1e1e1e;
  border:1px solid #555;
  padding:20px;
  overflow:auto;
  z-index:9999;
}

pre{
  background:black;
  padding:15px;
  white-space:pre-wrap;
  word-wrap:break-word;
}
</style>

</head>

<body>

<h1>🚀 Monitoring Dashboard</h1>

<div id="stats"></div>

<h2>Latest Logs</h2>

<table>
<thead>
<tr>
<th>Time</th>
<th>Type</th>
<th>Method</th>
<th>URL</th>
<th>Action</th>
</tr>
</thead>

<tbody id="logs"></tbody>

</table>

<div id="payloadModal">

<button onclick="closeModal()">
Close
</button>

<h3>Webhook Payload</h3>

<pre id="payloadContent"></pre>

</div>

<script>

async function loadStats() {

  const stats =
    await fetch('/stats')
    .then(r => r.json());

  document.getElementById('stats').innerHTML =
  \`
  <div class="card">
    <h3>Total Logs: \${stats.totalLogs}</h3>
    <h3>API Logs: \${stats.apiLogs}</h3>
    <h3>Webhook Logs: \${stats.webhookLogs}</h3>
    <h3>Health Logs: \${stats.healthLogs}</h3>
    <h3>Error Logs: \${stats.errorLogs}</h3>
    <h3>MongoDB: \${stats.mongo}</h3>
  </div>
  \`;
}

async function loadLogs() {

  const result =
    await fetch('/logs?limit=20')
    .then(r => r.json());

  document.getElementById('logs').innerHTML =
  result.data.map(log => \`
    <tr>
      <td>\${new Date(log.timestamp).toLocaleString()}</td>
      <td>\${log.type || '-'}</td>
      <td>\${log.method || '-'}</td>
      <td>\${log.url || '-'}</td>
      <td>
        <button onclick="showLog('\${log._id}')">
          View
        </button>
      </td>
    </tr>
  \`).join('');
}

async function showLog(id){

  try{

    const log =
      await fetch('/logs/' + id)
      .then(r => r.json());

    document.getElementById('payloadContent')
      .textContent =
      JSON.stringify(log, null, 2);

    document.getElementById('payloadModal')
      .style.display = 'block';

  }catch(err){

    alert('Unable to load log');

  }
}

function closeModal(){

  document.getElementById('payloadModal')
    .style.display = 'none';

}

loadStats();
loadLogs();

setInterval(() => {

  loadStats();
  loadLogs();

}, 5000);

</script>

</body>
</html>
`);
});

/* -------------------- Webhook Verification -------------------- */

app.get("/", async (req, res) => {
  const {
    "hub.mode": mode,
    "hub.challenge": challenge,
    "hub.verify_token": token,
  } = req.query;

  const logData = {
    type: "webhook",
    method: "GET_VERIFY",
    url: "/",
    request: req.query,
  };

  if (mode === "subscribe" && token === verifyToken) {
    console.log("✅ WEBHOOK VERIFIED");

    await saveLog({
      ...logData,
      response: { verified: true },
    });

    return res.status(200).send(challenge);
  }

  await saveLog({
    ...logData,
    response: { verified: false },
  });

  return res.status(403).end();
});

/* -------------------- Webhook Receiver -------------------- */

app.post("/", async (req, res) => {
  console.log("📩 Webhook Received");

  await saveLog({
    type: "webhook",
    method: "POST_EVENT",
    url: "/",

    request: req.body,

    headers: req.headers,

    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,

    userAgent: req.get("user-agent"),

    timestamp: new Date(),
  });

  res.status(200).send("EVENT_RECEIVED");
});

/* -------------------- API Proxy Routes -------------------- */

app.get("/api/get", async (req, res) => {
  await handleRequest(req, res, "get");
});

app.post("/api/post", async (req, res) => {
  await handleRequest(req, res, "post");
});

app.put("/api/put/:id", async (req, res) => {
  await handleRequest(req, res, "put");
});

app.delete("/api/delete", async (req, res) => {
  await handleRequest(req, res, "delete");
});

/* -------------------- API Handler -------------------- */

async function handleRequest(req, res, method) {
  const { url, headers, body, params } = req.body;

  const logBase = {
    type: "api",
    method,
    url,
    request: req.body,
  };

  try {
    if (!url) {
      await saveLog({
        ...logBase,
        error: { message: "URL is required" },
      });

      return res.status(400).json({
        error: "URL is required",
      });
    }

    let response;

    if (method === "get" || method === "delete") {
      response = await axios({
        method,
        url,
        headers: headers || {},
        params: params || {},
      });
    } else {
      response = await axios({
        method,
        url,
        headers: headers || {},
        params: params || {},
        data: body || {},
      });
    }

    await saveLog({
      ...logBase,
      response: response.data,
    });

    res.json(response.data);
  } catch (error) {
    await saveLog({
      ...logBase,
      error: {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
      },
    });

    res.status(500).json({
      error: error.message,
    });
  }
}

/* -------------------- Start Server -------------------- */

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📊 Dashboard: http://localhost:${port}/dashboard`);
  console.log(`❤️ Health: http://localhost:${port}/health`);
});
