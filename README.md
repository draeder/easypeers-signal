# Easypeers-signal
> Easy signaling for connecting WebRTC peers

:construction: Currently a work in progress! :construction:

## Install
Clone this repo, then

```
npm install
```

## Usage
### Server
#### Start the easypeers-signal server
```
npm start
```

#### Start an http server to serve the client
```
npm i http-server -g
```

```
http-server
```

### Client
Browse to [http://localhost:8000](http://localhost:8000) in multiple tabs

From developer tools,

Send broadcast messages with:
```js
broadcastMessage("your message")
```

Send direct messages with:
```js
sendMessageTo("<peer address>", "your message")
```