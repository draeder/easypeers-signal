# Easypeers-signal
> Easy signaling for connecting WebRTC peers

:construction: Currently a work in progress! :construction:

As of the current implementation, Easypeers-signal connects all peers together with a partial mesh.

It uses a gossip protocol to relay messages from peer A to peer Z, using a ratio of known peers. Through that, broadcast messages reach all peers, but reduce network load. Direct messaging is then also possible through the gossip protocol.

## Install
Clone this repo, then:

```
npm install
```

## Usage
### Server
#### Start the easypeers-signal server
```
npm start
```

### Client
Browse to [http://localhost:8080](http://localhost:8080) in multiple tabs

From developer tools, send broadcast messages with:
```js
es.send("your message")
```

Send direct messages with:
```js
es.send("<peer address>", "your message")
```

#### Javascript
```js
import { EasypeersSignal } from "./index.js"

const es = new EasypeersSignal()
es.on('message', (message) => {
  console.log('Got message: ', message)
})

es.send('message')
es.send('< peer adddress >', message)
```

## API
### Properties
#### `opts [object]`
```js
let opts = {
  maxPeers: 6, // maximum number of peer connections per peer
  fanout: 0.4, // ratio of peers per maxPeers to gossip to
  iceConfig: { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] },
  wsServer: 'ws://localhost:8080', // the websocket server peers connect to for WebRTC signaling
  // Low-level configuration options
  _GOSSIP_LIFETIME: 60 * 1000, // TTL for messages
  debug: false // enable/disable logging
}
```
#### 

### Methods
#### `es.send(message [string])`
Send a broadcast message
#### `es.send(id [string] || ids [array], message [any])`
Send a direct message
#### `es.emit(eventName [string], data [any])`
Emit a custom event
> Note: this does not emit the event through the swarm. It emits it to the peer that sends it.
#### `es.peers()`
Return a list of peers the current peer is connected to

### Listeners
#### `es.on`
Listen for new events
#### `es.once`
Listen for an event only once
#### `es.off(eventName [string], listener [function])`
Remove a listenter for an event

### Events
#### `init`
Listens for the given peer's address once Easypeers-signal is initialized
#### `connected`
Listens for newly connected peers and returns the peer address
#### `message`
Listens for new direct or broadcast messages from peers
#### `disconnect`
Listeens for newly disconnected peer addresses