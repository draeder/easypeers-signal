const http = require('http');
const WebSocket = require('ws');

let clients = {};

const server = http.createServer((req, res) => {});

const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
  let id;

  ws.on('message', message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.log('Invalid JSON');
      data = {};
    }

    switch (data.type) {
      case 'hello':
        id = data.id;
        clients[id] = ws;
        clients[id].lastHeartbeat = Date.now()
        console.log(data.reconnected)
        // if (!data.reconnected) {
        //   // return
        // }
        ws.send(JSON.stringify({ type: 'server-is-alive' }))
        notifyPeersAboutNewPeer(id);
        break;
      case 'offer':
      case 'answer':
      case 'candidate':
        forwardMessage(data);
        break;
      case 'heartbeat':
        clients[id].lastHeartbeat = Date.now()
        break;
      default:
        console.log("Received unexpected message type: " + data.type);
        break;
    }
  });

  ws.on('close', () => {
    delete clients[id];
  });
});

setInterval(() => {
  let now = Date.now();

  for (let id in clients) {
    // If we haven't received a heartbeat in over 10 seconds
    if (now - clients[id].lastHeartbeat > 10000) {
      // Close the WebSocket and remove the client from the clients map
      clients[id].close();
      delete clients[id];
    }
  }
}, 10000);

function notifyPeersAboutNewPeer(id) {
  let data = JSON.stringify({
    type: 'new-peer',
    id: id
  });

  for (let clientId in clients) {
    // Send message to all clients except for the newly connected client
    if (clientId !== id) {
      clients[clientId].send(data);
    }
  }
}

function forwardMessage(data) {
  let targetClient = clients[data.targetId];
  if (targetClient && targetClient.readyState === WebSocket.OPEN) {
    let messageToForward = {
      type: data.type,
      [data.type]: data[data.type],
      id: data.id,
      targetId: data.targetId
    };
    console.log('Forwarding message:', messageToForward); // Added log
    targetClient.send(JSON.stringify(messageToForward));
  }
}

server.listen(8080, () => {
  console.log((new Date()) + ' Server is listening on port 8080');
});
