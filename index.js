const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());
app.use(cors());
// Route handler for GET requests
app.get("/api/get", async (req, res) => {
  await handleRequest(req, res, "get");
});

// Route handler for POST requests
app.post("/api/post", async (req, res) => {
  await handleRequest(req, res, "post");
});

// Route handler for PUT requests
app.put("/api/put/:id", async (req, res) => {
  await handleRequest(req, res, "put");
});

// Route handler for DELETE requests
app.delete("/api/delete", async (req, res) => {
  await handleRequest(req, res, "delete");
});

// Generic function to handle requests
async function handleRequest(req, res, method) {
  try {
    let { url, headers, body, params } = req.body;
    // console.log({ url, headers, body, params });
    // Validate required fields
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Make the Axios request
    headers = headers ? headers : {};
    let data = body ? body : {};
    params = params ? params : {};

    const response = await axios[method](url, data, { headers });

    // Respond with the data received from the external API
    res.json(response.data);
  } catch (error) {
    // Handle errors
    console.log(error);
    res.status(500).json({ error: error.message });
  }
}

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
