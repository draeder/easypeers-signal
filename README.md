# Easypeers-signal
> Easy signaling for connecting WebRTC peers

:construction: Currently a work in progress! :construction:

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
Browse to [http://localhost:8080](http://localhost:8000) in multiple tabs

From developer tools,

Send broadcast messages with:
```js
es.send("your message")
```

Send direct messages with:
```js
es.send("<peer address>", "your message")
```