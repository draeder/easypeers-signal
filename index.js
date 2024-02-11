export function EasypeersSignal(opts) {
  const events = new EventEmitter();
  globalThis.es = this;

  this.on = (eventName, listener) => {
    events.on(eventName, listener);
  };
  this.off = (eventName, listener) => {
    events.off(eventName, listener);
  };
  this.once = (eventName, listener) => {
    events.once(eventName, listener);
  };
  this.emit = (eventName, data) => {
    events.emit(eventName, data);
  };

  const maxPeers = opts && opts.maxPeers ? opts.maxPeers : 6;
  const fanout = (this.fanout = opts && opts.fanout ? opts.fanout : 0.5);
  const configuration =
    opts && opts.iceConfig
      ? opts.iceConfig
      : { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  const _GOSSIP_LIFETIME_MS =
    opts && opts._GOSSIP_LIFETIME_MS ? opts._GOSSIP_LIFETIME_MS : 60 * 1000;

  let peerId;
  let rtcPeerConnections = {};
  let dataChannels = {};
  let peerCount = 0;
  let seenGossipIds = {};

  this.peers = () => {
    return Object.keys(rtcPeerConnections);
  };

  async function init(str) {
    if (!str || typeof str !== "string") {
      peerId = await generateRandomSHA1();
      if (opts && opts.debug) console.debug("Peer ID:", peerId);
    } else {
      peerId = await sha1(str);
      if (opts && opts.debug) console.debug("Peer ID:", peerId);
    }
    events.emit("init", peerId);
    startWebSocketConnection();
  }

  function setSeenGossip(gossipId) {
    seenGossipIds[gossipId] = true;

    setTimeout(() => {
      delete seenGossipIds[gossipId];
    }, _GOSSIP_LIFETIME_MS);
  }

  async function gossipToClosePeers(
    message,
    gossipId,
    fraction,
    excludePeers = [],
    relayingPeerId,
    from
  ) {
    let peers = Object.keys(dataChannels).reduce((acc, id) => {
      if (id !== relayingPeerId && id !== from && !excludePeers.includes(id)) {
        acc[id] = dataChannels[id];
      }
      return acc;
    }, {});

    let closestPeers = getClosestPeers(peers, relayingPeerId, fraction);

    for (let peerId of closestPeers) {
      let dataChannel = dataChannels[peerId];

      if (dataChannel.readyState === "open") {
        dataChannel.send(message);
        if (opts && opts.debug) console.debug(`Message relayed to ${peerId}`);
      } else {
        if (opts && opts.debug)
          console.debug(
            `Data channel with ${peerId} is not open. Current state: ${dataChannel.readyState}`
          );
      }
    }
  }

  this.send = async (id, message) => {
    let event;
    let gossipId;
    let messageContent;

    if (typeof message === "undefined") {
      messageContent = id;
      gossipId = await SHA256(messageContent);

      event = {
        type: "message",
        from: peerId,
        content: messageContent,
        gossipId: gossipId,
      };

      setSeenGossip(gossipId);

      let excludePeers = [];
      gossipToClosePeers(JSON.stringify(event), gossipId, fanout, excludePeers);
    } else {
      messageContent = message;
      gossipId = await SHA256(messageContent);

      event = {
        type: "message",
        from: peerId,
        to: id,
        content: messageContent,
        gossipId: gossipId,
      };

      setSeenGossip(gossipId);

      let excludePeers = [];
      gossipToClosePeers(JSON.stringify(event), gossipId, fanout, excludePeers);
    }
  };

  async function createPeerConnection(targetId) {
    let rtcPeerConnection = new RTCPeerConnection(configuration);
    let dataChannel = rtcPeerConnection.createDataChannel("dataChannel", {
      reliable: true,
    });

    rtcPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        send({
          type: "candidate",
          candidate: event.candidate.toJSON(),
          targetId: targetId,
        });
      }
    };

    rtcPeerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      dataChannel.onopen = (event) => {
        if (opts && opts.debug)
          console.debug("Data channel is open with " + targetId);
        events.emit("connected", targetId);
      };
      dataChannel.onerror = (error) => {
        if (opts && opts.debug) console.debug("Error:", error);
      };

      dataChannel.onmessage = async (event) => {
        if (opts && opts.debug) console.debug("Event received:", event);
        let message = JSON.parse(event.data);
        if (opts && opts.debug) console.debug("Parsed message:", message);

        if (seenGossipIds[message.gossipId]) {
          if (opts && opts.debug)
            console.debug(
              `Already seen message with gossipId ${message.gossipId}`
            );
          return;
        }

        if (!message.to || (message.to && message.to.includes(peerId))) {
          events.emit("message", message);
        }

        setSeenGossip(message.gossipId);
        let excludePeers = [peerId];
        gossipToClosePeers(
          JSON.stringify(message),
          message.gossipId,
          0.33,
          excludePeers,
          peerId,
          message.from
        );
      };
    };

    rtcPeerConnection.oniceconnectionstatechange = () => {
      if (rtcPeerConnection.iceConnectionState == "disconnected") {
        if (opts && opts.debug) console.debug("Peer disconnected: " + targetId);
        events.emit("disconnect", targetId);
        delete rtcPeerConnections[targetId];
        delete dataChannels[targetId];
        peerCount--;
      }
    };

    rtcPeerConnections[targetId] = rtcPeerConnection;
    dataChannels[targetId] = dataChannel;
  }

  let ws;
  let isInitiator = false;
  let heartbeatIntervalId;
  let reconnectAttempts = 0;
  let minReconnectDelay = 1000;
  let maxReconnectDelay = 30000;
  let currentReconnectDelay = minReconnectDelay;

  function startWebSocketConnection() {
    ws = new WebSocket(
      opts && opts.wsServer ? opts.wsServer : "ws://localhost:8080"
    );

    ws.onopen = async () => {
      if (opts && opts.debug)
        console.debug("Connected to the signaling server");

      if (
        Object.keys(rtcPeerConnections).length === 0 &&
        reconnectAttempts > 0
      ) {
        let data = {
          type: "hello",
          id: peerId,
          reconnected: true,
        };

        send(data);
        isInitiator = true;
      } else {
        let data = {
          type: "hello",
          id: peerId,
          reconnected: reconnectAttempts > 0,
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
        id: peerId,
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

    ws.onerror = (err) => {
      console.error(err);
    };

    let hasHandledServerIsAlive = false;

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (opts && opts.debug) console.debug(data);

      if (opts && opts.debug) console.debug("Relaying peer ID:", data.id);

      switch (data.type) {
        case "server-is-alive":
          if (
            !hasHandledServerIsAlive &&
            reconnectAttempts > 0 &&
            peerCount == 0
          ) {
            let data = {
              type: "hello",
              id: peerId,
              reconnected: reconnectAttempts > 0,
              topics: opts && opts.topics ? opts.topics : undefined,
            };
            send(data);
            hasHandledServerIsAlive = true;
          }
          break;
        case "new-peer":
          if (data.id !== peerId) {
            if (opts && opts.debug) console.debug("New peer: " + data.id);
            if (isInitiator && peerCount < maxPeers) {
              startConnection(data.id);
              peerCount++;
            }
          }
          break;
        case "offer":
          if (data.id !== peerId) {
            handleOffer(data.offer, data.id);
          }
          break;
        case "answer":
          if (data.id !== peerId) {
            handleAnswer(data.answer, data.id);
          }
          break;
        case "candidate":
          if (data.id !== peerId) {
            handleCandidate(data.candidate, data.id);
          }
          break;
        default:
          break;
      }
    };

    ws.onclose = (event) => {
      reconnectAttempts++;
      setTimeout(function () {
        startWebSocketConnection();
      }, currentReconnectDelay);
      currentReconnectDelay = Math.min(
        currentReconnectDelay * 2,
        maxReconnectDelay
      );
      if (opts && opts.debug)
        console.debug(
          "WebSocket is closed. Reconnect will be attempted in " +
            currentReconnectDelay / 1000 +
            " second.",
          event.reason
        );
      hasHandledServerIsAlive = true;
    };
  }

  async function startConnection(targetId) {
    await createPeerConnection(targetId);
    rtcPeerConnections[targetId]
      .createOffer()
      .then((offer) => {
        rtcPeerConnections[targetId].setLocalDescription(offer);
        send({
          type: "offer",
          offer: offer,
          targetId: targetId,
        });
        if (opts && opts.debug) console.debug("Starting connection");
      })
      .catch((error) => {
        console.error("Error creating an offer", error);
      });
  }

  function send(message) {
    message.id = peerId;
    ws.send(JSON.stringify(message));
  }

  async function handleOffer(offer, id) {
    await createPeerConnection(id);
    rtcPeerConnections[id]
      .setRemoteDescription(new RTCSessionDescription(offer))
      .then(() => rtcPeerConnections[id].createAnswer())
      .then((answer) => {
        rtcPeerConnections[id].setLocalDescription(answer);
        send({
          type: "answer",
          answer: answer,
          targetId: id,
        });
        if (opts && opts.debug) console.debug("Setting local description");
      })
      .then(() => {
        rtcPeerConnections[peerId].setRemoteDescription(
          new RTCSessionDescription(offer)
        );
      })
      .catch((error) => {
        if (opts && opts.debug) console.error("Error handling offer", error);
      });
  }

  function handleAnswer(answer, id) {
    rtcPeerConnections[id].setRemoteDescription(
      new RTCSessionDescription(answer)
    );
    if (opts && opts.debug) console.debug("remote description set");
  }

  function handleCandidate(candidate, id) {
    rtcPeerConnections[id].addIceCandidate(new RTCIceCandidate(candidate));
    if (opts && opts.debug) console.debug("handling ice candidate");
  }

  init();
}

async function generateRandomSHA1() {
  let array = new Uint8Array(20);
  window.crypto.getRandomValues(array);
  let hashBuffer = await window.crypto.subtle.digest("SHA-1", array);
  let hashArray = Array.from(new Uint8Array(hashBuffer));
  let hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

async function sha1(input) {
  const msgUint8 = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-1", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

async function SHA256(message) {
  const msgUint8 = new TextEncoder().encode(message + Date.now());
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

const EventEmitter = function (opts) {
  const eventTarget = new EventTarget();

  this.on = (eventName, listener) => {
    const wrapper = (event) => {
      listener(event.detail);
    };
    listener.__wrapper = wrapper;
    eventTarget.addEventListener(eventName, wrapper);
  };

  this.off = (eventName, listener) => {
    eventTarget.removeEventListener(eventName, listener.__wrapper);
  };

  this.once = (eventName, listener) => {
    const onceListener = (event) => {
      listener(event.detail);
      this.off(eventName, onceListener);
    };
    onceListener.__wrapper = onceListener;
    eventTarget.addEventListener(eventName, onceListener);
  };
  this.emit = (eventName, data) => {
    const event = new CustomEvent(eventName, { detail: data });
    eventTarget.dispatchEvent(event);
  };
};

function getClosestPeers(peers, relayingPeerId, fraction) {
  let relayingPeerIdNum = parseInt(relayingPeerId, 16);
  let peerIds = Object.keys(peers);
  let otherPeerIds = peerIds.filter((id) => id !== relayingPeerId);

  otherPeerIds.sort((a, b) => {
    let aDist = Math.abs(parseInt(a, 16) - relayingPeerIdNum);
    let bDist = Math.abs(parseInt(b, 16) - relayingPeerIdNum);
    return aDist - bDist;
  });

  let count = Math.round(otherPeerIds.length * fraction);

  if (count === 0 && otherPeerIds.length > 0) {
    count = 1;
  }

  return otherPeerIds.slice(0, count);
}
