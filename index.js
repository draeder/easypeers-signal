console.log('Easypeers')

async function generateRandomSHA1() {
  let array = new Uint8Array(20);
  window.crypto.getRandomValues(array);
  let hashBuffer = await window.crypto.subtle.digest('SHA-1', array);
  let hashArray = Array.from(new Uint8Array(hashBuffer));
  let hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

let peerId;

async function init() {
    peerId = await generateRandomSHA1();
    console.log('Peer ID:', peerId);
    startWebSocketConnection(); 
}

let configuration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] };
let rtcPeerConnections = {};
let dataChannels = {};
let connectionCount = 0;
let connectionLimit = 4;
let seenGossipIds = {};

const GOSSIP_LIFETIME_MS = 60 * 1000; // 1 minute

function setSeenGossip(gossipId) {
  seenGossipIds[gossipId] = true;

  setTimeout(() => {
    delete seenGossipIds[gossipId];
  }, GOSSIP_LIFETIME_MS);
}


async function createPeerConnection(targetId) {
  let rtcPeerConnection = new RTCPeerConnection(configuration);
  let dataChannel = rtcPeerConnection.createDataChannel("dataChannel", { reliable: true });

  rtcPeerConnection.onicecandidate = event => {
    if (event.candidate) {
      send({
        type: "candidate",
        candidate: event.candidate.toJSON(),
        targetId: targetId
      });
    }
  };

  rtcPeerConnection.ondatachannel = event => {
    dataChannel = event.channel;
    dataChannel.onopen = event => {
        console.log("Data channel is open with " + targetId);
    };
    dataChannel.onerror = error => {
      console.log("Error:", error);
    };

    dataChannel.onmessage = async event => {
      let message = JSON.parse(event.data);
    
      if (seenGossipIds[message.gossipId]){
        console.log(`Already seen message with gossipId ${message.gossipId}`);
        return;
      }
      console.log("Got message:", message.content);
    
      // Relay the message to the closest peers, excluding Peer B itself
      setSeenGossip(message.gossipId);
      let excludePeers = [peerId];
      gossipToClosePeers(message.content, message.gossipId, 0.33, excludePeers);
    };
    
    // Add this log to check if the dataChannel is successfully bound to the peer connection
    console.log("Data channel bound to peer connection.");
  };


  rtcPeerConnection.oniceconnectionstatechange = () => {
    if(rtcPeerConnection.iceConnectionState == "disconnected") {
      console.log('Peer disconnected: ' + targetId);
      delete rtcPeerConnections[targetId];
      delete dataChannels[targetId];
      connectionCount--;
    }
  };

  rtcPeerConnections[targetId] = rtcPeerConnection;
  dataChannels[targetId] = dataChannel;
}

async function sha1(input) {
  const msgUint8 = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
async function SHA256(message) {
  const msgUint8 = new TextEncoder().encode(message + Date.now());                          
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);                   
  const hashArray = Array.from(new Uint8Array(hashBuffer));                    
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

function getClosestPeers(peers, relayingPeerId, fraction) {
  // Convert the relaying peer ID to a number.
  let relayingPeerIdNum = parseInt(relayingPeerId, 16);

  // Create an array of peer IDs.
  let peerIds = Object.keys(peers);

  // Exclude the relaying peer from the list of peer IDs.
  let otherPeerIds = peerIds.filter(id => id !== relayingPeerId);

  // Sort the other peer IDs based on their closeness to the relaying peer ID.
  otherPeerIds.sort((a, b) => {
    let aDist = Math.abs(parseInt(a, 16) - relayingPeerIdNum);
    let bDist = Math.abs(parseInt(b, 16) - relayingPeerIdNum);
    return aDist - bDist;
  });

  // Select the closest peers based on the specified fraction.
  let count = Math.round(otherPeerIds.length * fraction);
  return otherPeerIds.slice(0, count);
}

const ROUND_DELAY = 1000; // Adjust this value based on your requirements (1 second in this example)

async function gossipToClosePeers(message, gossipId, fraction, excludePeers = []) {
  // Get all connected peers, including the ones in the excludePeers array
  let peers = Object.keys(dataChannels);

  console.log("Relaying message to all connected peers. Peers:", peers);

  for (const peerId of peers) {
    let dataChannel = dataChannels[peerId];

    if (dataChannel.readyState === "open") {
      let messageObject = {
        content: message,
        gossipId: gossipId,
      };
      dataChannel.send(JSON.stringify(messageObject));
      console.log(`Message sent to ${peerId}`);
    } else {
      console.log(`Data channel with ${peerId} is not open. Current state: ${dataChannel.readyState}`);
    }
  }

  // Mark all connected peers as seen to prevent redundant relay
  peers.forEach(peerId => setSeenGossip(gossipId));

  // Simulate a round with a delay, then send the message to the next set of peers
  setTimeout(() => {
    if (peers.length > 0) {
      gossipToClosePeers(message, gossipId, fraction, excludePeers);
    }
  }, ROUND_DELAY);

  console.log("Finished relaying message to all connected peers.");

  // Return the list of peers that have been relayed to
  return peers;
}

async function broadcastMessage(message) {
  const gossipId = await SHA256(message);
  console.log("gossipId created: " + gossipId);

  let event = {
    type: "message",
    content: message,
    gossipId: gossipId
  };

  // Mark the message as seen for the sender
  setSeenGossip(gossipId);

  // Relay the message to all connected peers using connectionLimit set to 1 (broadcast to one peer)
  let excludePeers = []; // do not exclude sender
  gossipToClosePeers(JSON.stringify(event), gossipId, 1, excludePeers);

  // Send the message to the relaying peer (sending peer) if it's ready
  let sendingPeerChannel = dataChannels[peerId];
  if (sendingPeerChannel && sendingPeerChannel.readyState === "open") {
    let messageObject = {
      content: message,
      gossipId: gossipId,
    };
    sendingPeerChannel.send(JSON.stringify(messageObject));
    console.log(`Message sent to relaying peer (sending peer) ${peerId}`);
  }
}

function sendMessageToId(id, message) {
  if (dataChannels[id]) {
    dataChannels[id].send(message);
  } else {
    console.log(`No connection established with peer ${id}`);
  }
}

let ws;
let isInitiator = false
let heartbeatIntervalId;
let reconnectAttempts = 0
let minReconnectDelay = 1000; // 1 second
let maxReconnectDelay = 30000; // 30 seconds
let currentReconnectDelay = minReconnectDelay;

function startWebSocketConnection() {
  ws = new WebSocket('ws://localhost:8080');

  ws.onopen = async () => {
    console.log('Connected to the signaling server');

    // Check if the client has no peers connected and there has been a reconnect attempt
    if (Object.keys(rtcPeerConnections).length === 0 && reconnectAttempts > 0) {
        let data = {
          type: "hello",
          id: peerId,
          reconnected: true
        };

        send(data);
        isInitiator = true;
    } else {
        let data = {
          type: "hello",
          id: peerId,
          reconnected: reconnectAttempts > 0
        };

        if (!data.reconnected) {
          isInitiator = true;
        }
    
        reconnectAttempts = 0; 

        send(data);
        isInitiator = true;
    }

    let heartbeat = {
      type: "heartbeat",
      id: peerId
    };

    send(heartbeat);
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
    }
    heartbeatIntervalId = setInterval(() => {
      send(heartbeat);
    }, 5000);

    currentReconnectDelay = minReconnectDelay;
};

  ws.onerror = err => {
      console.error(err)
  };

  let hasHandledServerIsAlive = false;

  ws.onmessage = msg => {
    const data = JSON.parse(msg.data);
    console.log(data)

    console.log("Relaying peer ID:", data.id);
    
    switch(data.type) {
      case 'server-is-alive':
        if (!hasHandledServerIsAlive && reconnectAttempts > 0 && connectionCount == 0) {
          let data = {
            type: "hello",
            id: peerId,
            reconnected: reconnectAttempts > 0
          };
          send(data);
          hasHandledServerIsAlive = true;
        }
        break;  
      case 'new-peer':
        if (data.id !== peerId) {
          console.log('New peer: ' + data.id);
          if (isInitiator && connectionCount < connectionLimit) {
            startConnection(data.id);
            connectionCount++;
          }
        }
        break;
      case 'offer':
        if (data.id !== peerId) {
          handleOffer(data.offer, data.id);
        }
        break;
      case 'answer':
        if (data.id !== peerId) {
          handleAnswer(data.answer, data.id);
        }
        break;
      case 'candidate':
        if (data.id !== peerId) {
          handleCandidate(data.candidate, data.id);
        }
        break;
      default:
        break;
    }
  };
  
  ws.onclose = event => {
    reconnectAttempts++
    setTimeout(function() {
      startWebSocketConnection();
    }, currentReconnectDelay);
    currentReconnectDelay = Math.min(currentReconnectDelay * 2, maxReconnectDelay);
    console.log("WebSocket is closed. Reconnect will be attempted in " + currentReconnectDelay / 1000 + " second.", event.reason);
    hasHandledServerIsAlive = true;
  };
}

async function startConnection(targetId) {
  await createPeerConnection(targetId);
  rtcPeerConnections[targetId].createOffer()
    .then(offer => {
      rtcPeerConnections[targetId].setLocalDescription(offer);
      send({
        type: "offer",
        offer: offer,
        targetId: targetId 
      });
      console.log('Starting connection')
    })
    .catch(error => {
      console.error("Error creating an offer", error);
    });
}

function send(message) {
  message.id = peerId;
  // console.log('Sending message:', message);
  ws.send(JSON.stringify(message));
}

async function handleOffer(offer, id) {
  await createPeerConnection(id);
  rtcPeerConnections[id].setRemoteDescription(new RTCSessionDescription(offer))
    .then(() => rtcPeerConnections[id].createAnswer())
    .then(answer => {
      rtcPeerConnections[id].setLocalDescription(answer);
      send({
        type: "answer",
        answer: answer,
        targetId: id 
      });
      console.log('Setting local description');
    })
    .then(() => {
      // Add the following line to set the remote description for the sending peer (relaying peer)
      rtcPeerConnections[peerId].setRemoteDescription(new RTCSessionDescription(offer));
    })
    .catch(error => {
      console.error("Error handling offer", error);
    });
}


function handleAnswer(answer, id) {
  rtcPeerConnections[id].setRemoteDescription(new RTCSessionDescription(answer));
  console.log("remote description set")
}

function handleCandidate(candidate, id) {
  rtcPeerConnections[id].addIceCandidate(new RTCIceCandidate(candidate));
  console.log('handling ice candidate')
}

init()
