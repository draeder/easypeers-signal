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