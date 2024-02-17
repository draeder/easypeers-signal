const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

let clients = {};

if (process.env.NODE_ENV === "production") {
  console.debug = () => {}; // Override debug logging in production
}

const server = http.createServer((req, res) => {
  if (req.url === "/_ah/health") {
    res.writeHead(200);
    res.end("OK");
    return;
  }

  let filePath = "." + req.url;
  if (filePath == "./") {
    filePath = "./index.html";
  }

  let extname = String(path.extname(filePath)).toLowerCase();
  let mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
  };

  let contentType = mimeTypes[extname] || "application/octet-stream";

  fs.readFile(filePath, function (error, content) {
    if (error) {
      if (error.code == "ENOENT") {
        res.writeHead(404);
        res.end("Resource not found");
      } else {
        res.writeHead(500);
        res.end(
          "Sorry, there was an error loading the requested file.",
          "utf-8"
        );
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  let id;
  let topics = [];

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.log("Invalid JSON", e);
      data = {};
    }

    switch (data.type) {
      case "hello":
        id = data.id;
        topics = data.topics || [];
        clients[id] = { ws: ws, topics: topics, lastHeartbeat: Date.now() };
        ws.send(JSON.stringify({ type: "server-is-alive" }));
        notifyPeersAboutNewPeer(id);
        break;
      case "offer":
      case "answer":
      case "candidate":
        forwardMessage(data);
        break;
      case "heartbeat":
        clients[id]
          ? (clients[id].lastHeartbeat = Date.now())
          : delete clients[id];
        break;
      default:
        console.log("Received unexpected message type: " + data.type);
        break;
    }
  });

  ws.on("close", () => {
    delete clients[id];
  });
});

setInterval(() => {
  let now = Date.now();
  for (let id in clients) {
    if (now - clients[id].lastHeartbeat > 10000) {
      clients[id].ws.close();
      delete clients[id];
    }
  }
}, 10000);

function notifyPeersAboutNewPeer(id) {
  let data = JSON.stringify({
    type: "new-peer",
    id: id,
  });

  for (let clientId in clients) {
    // check if both clients don't have topics or if they share a topic
    if (
      clientId !== id &&
      ((!clients[id].topics.length && !clients[clientId].topics.length) ||
        clients[clientId].topics.some((topic) =>
          clients[id].topics.includes(topic)
        ))
    ) {
      clients[clientId].ws.send(data);
    }
  }
}

function forwardMessage(data) {
  let targetClient = clients[data.targetId];
  if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
    let messageToForward = {
      type: data.type,
      [data.type]: data[data.type],
      id: data.id,
      targetId: data.targetId,
    };

    if (
      (clients[data.id].topics.length === 0 &&
        targetClient.topics.length === 0) ||
      (clients[data.id].topics.length > 0 &&
        targetClient.topics.includes(data.topic))
    ) {
      targetClient.ws.send(JSON.stringify(messageToForward));
    }
  }
}

server.listen(process.env.PORT || 3000, () => {
  console.log(
    new Date() + " Server is listening on port " + (process.env.PORT || 3000)
  );
});
