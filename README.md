# @footgun/network

A node.js library for low latency, realtime networking over UDP.

Features:

* extremely low latency message delivery
* `unreliable-unordered` channels
* `reliable-ordered` channels
* per-endpoint Round Trip Time (RTT) estimation
* send/receive transfer speed estimations
* data oriented design
* has unit and soak tests
* minimal (~500 lines of code)
* 0 external dependencies
* pure es module


## Usage

How to set up a run loop, send/receive messages

```javascript
import * as Network from '@footgun/network'
import dgram        from 'dgram'


async function main () {
	const socket = dgram.createSocket('udp4')

	// listen for data, local:   address     port
    await bind(socket,          '0.0.0.0',   3000)

    // create endpoint, remote:            address   port
    const endpoint = Network.init(socket, '0.0.0.0', 3000)

    // unreliable channels are great for high volume eventually consistent data like player positions, etc.
    Network.addChannel(endpoint, Network.CHANNEL_UNRELIABLE)

    // reliable channels are useful for lower volume events that need guaranteed, in order delivery
    // e.g., I'm entering a vehicle, I'm shooting a missile, etc.
    Network.addChannel(endpoint, Network.CHANNEL_RELIABLE)


    // listen for new data on the UDP socket
    socket.on('message', function (message, rinfo) {
    	Network.readPacket(endpoint, message) // process all received data through the endpoint
    })

    // the channels ids are based on the order they were added to the endpoint.
    // so for example above we first called Network.addChannel(...) with CHANNEL_UNRELIABLE so it's channelid is 0
    const unreliableChannelId = 0
    const reliableChannelId = 1

    const gameLoop = function () {

    	// send one message over unreliable channel
    	const [ x, y ] = [ 100, 106 ]
    	const playerPosMsg = new Uint8Array([ x, y ]) // a simple 2 byte message to send
    	Network.sendMessage(endpoint, unreliableChannelId, playerPosMsg, playerPosMsg.byteLength)

    	// send one message over reliable channel
    	const enterVehicleMsg = new Uint8Array([ 23, 106, 255, 0, 24, 14, 91 ]) 
    	Network.sendMessage(endpoint, reliableChannelId, enterVehicleMsg, enterVehicleMsg.byteLength)

    	// receive messages over the unreliable channel (each message is a Uint8Array)
    	const unreliableMsgs = Network.recvMessages(endpoint, unreliableChannelId)

    	// also an array of messages, but the reliable channels will ensure the order is
    	// maintained, so if packets are dropped or arrive out of order you can still have
    	// confidence you'll see a consistent ordered message stream here that matches what
    	// the sending side put in.
    	const reliableMsgs = Network.recvMessages(endpoint, reliableChannelId)


    	// package all queued messages into packets and send them over the underlying UDP socket
    	Network.transmitPackets(endpoint)

    	// stats:

    	// network round trip in milliseconds
    	//console.log('RTT:', endpoint.RTT)

    	// upload rate in bytes/second
    	//console.log('upload:', endpoint.bandwidth.sendSpeed)

    	// download rate in bytes/second
    	//console.log('download:', endpoint.bandwidth.recvSpeed)

		setTimeout(gameLoop, 1)
	}

    gameLoop() // start running the game
}


main()


async function bind (socket, listenAddress, listenPort) {
	return new Promise(function (resolve, reject) {
        sock.bind(listenPort, listenAddress, function (er) {
            if (er)
                return reject(er)

            const address = sock.address()
            console.log(`Server listening at ${address.address}:${address.port}.`)
            resolve()
        })
    })
}


```


## References

* https://gafferongames.com/post/reliability_ordering_and_congestion_avoidance_over_udp
* https://github.com/mas-bandwidth/yojimbo
* https://github.com/padenot/ringbuf.js
