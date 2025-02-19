import { createSocket } from 'dgram'


/*
Provides traffic shaping for networking soak tests between 2 peers. invocation:

node test-udp-shaping-proxy.js

Then point the 2 clients at 0.0.0.0:3000
*/

const server = createSocket('udp4')

// you can pass in any of these settings via environment variable, or use the defaults.
const PROXY_PORT = process.env.PROXY_PORT || 3000
const DROP_PROBABILITY = parseFloat(process.env.DROP_PROBABILITY) || 0.2
const AVERAGE_DELAY_MS = parseInt(process.env.AVERAGE_DELAY_MS) || 80
const JITTER_MS = parseInt(process.env.JITTER_MS) || 50
const BANDWIDTH_BYTES_PER_SEC = parseInt(process.env.BANDWIDTH_BYTES_PER_SEC) || 100_000


server.on('listening', () => {
    const address = server.address()
    console.log(`UDP proxy listening on: ${address.address}:${address.port}`)
})

server.on('message', function (msg, rinfo) {
    const dest = {
        address: '0.0.0.0',
        // client and server are harcoded to run on these 2 ports so just swap them
        port: (rinfo.port === 3001) ? 3002 : 3001
    }

    // Simulate packet drop
    if (Math.random() < DROP_PROBABILITY) {
        console.log(`Dropped packet from ${rinfo.address}:${rinfo.port}`)
        return
    }

    // Calculate delay: add average delay plus a random jitter between -JITTER_MS and +JITTER_MS
    let delay = AVERAGE_DELAY_MS + Math.floor(Math.random() * (2 * JITTER_MS)) - JITTER_MS
    if (delay < 0)
        delay = 0

    // Simulate bandwidth limitation: add extra delay proportional to the packet size
    const bandwidthDelay = (msg.length / BANDWIDTH_BYTES_PER_SEC) * 1000
    const totalDelay = delay + bandwidthDelay

    console.log(
        `Forwarding packet from ${rinfo.address}:${rinfo.port} to ${dest.address}:${dest.port} in ${totalDelay.toFixed(
            2
        )}ms (delay=${delay}ms, bandwidthDelay=${bandwidthDelay.toFixed(2)}ms)`
    )

    // Schedule the sending after the total delay
    setTimeout(() => {
        server.send(msg, 0, msg.length, dest.port, dest.address, (err) => {
            if (err)
                console.error('Error sending packet:', err)
        })
    }, totalDelay)
})


server.bind(PROXY_PORT)
