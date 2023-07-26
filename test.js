const puppeteer = require('puppeteer');
const { expect } = require('chai');

process.setMaxListeners(1500);

const totalRuns = 10;

async function createPeer() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    window.messages = [];
    window.peerReady = new Promise(resolve => window.signalPeerReady = resolve);
  });

  page.on('console', msg => {
    if (!msg.text().includes('favicon.ico')) {
      const text = msg.text();
      if (text.startsWith('Got message:')) {
        const message = JSON.parse(text.substring(12));
        if (message.content === 'mymessage') {
          page.evaluate((message) => {
            window.messages.push(message.content);
          }, message);
        }
      }
    }
  });

  await page.goto('http://localhost:8000');
  await page.evaluate(() => signalPeerReady());

  return { browser, page };
}

async function closePeer(peer) {
  await peer.page.close();
  await peer.browser.close();
}

async function getRandomPeer(peers) {
  return peers[Math.floor(Math.random() * peers.length)];
}

async function testBroadcast(numPeers) {
  const peers = [];

  for (let i = 0; i < numPeers; i++) {
    const peer = await createPeer();
    peers.push(peer);
  }

  const senderPeer = await getRandomPeer(peers);

  await senderPeer.page.evaluate(() => {
    broadcastMessage('mymessage');
  });

  const receivedPromises = peers.map(peer => peer.page.evaluate(() => {
    return new Promise(resolve => {
      const checkMessages = setInterval(() => {
        if (window.messages.includes('mymessage')) {
          clearInterval(checkMessages);
          resolve(true);
        }
      }, 500);
      setTimeout(() => {
        clearInterval(checkMessages);
        resolve(false);
      }, 3000);
    });
  }));

  const results = await Promise.all(receivedPromises);

  let totalMessagesReceived = results.filter(result => result).length;

  for (const peer of peers) {
    await closePeer(peer);
  }

  return {
    totalPeers: numPeers,
    receivedPeers: totalMessagesReceived,
    success: totalMessagesReceived === numPeers - 1
  };
}

describe('Broadcast Test', function () {
  this.timeout(5000000); // adjust this based on your system's capabilities and test duration

  it('should deliver broadcasted message to all peers except the sender', async function () {
    const totalRuns = 10; // adjust the number of runs based on your requirements
    let totalPassing = 0;

    for (let i = 0; i < totalRuns; i++) {
      const numPeers = 11;
      const testResult = await testBroadcast(numPeers);

      console.log(`Test number: ${i + 1}`);
      console.log(`Total Peers: ${testResult.totalPeers}`);
      console.log(`Peers that Received the Message: ${testResult.receivedPeers}`);
        
      if (testResult.success) {
        totalPassing++;
      }
    }

    const passingRate = totalPassing / totalRuns * 100;
    
    console.log(`Total runs: ${totalRuns}`);
    console.log(`Total passing: ${totalPassing}`);
    console.log(`Passing rate: ${passingRate}%`);

    expect(passingRate).to.be.above(0);  // adjust the passing rate as required
  });
});