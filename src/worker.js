import * as Network   from './network.js'
import * as Stream    from './uint8array/stream.js'
import dgram          from 'dgram'
import readMessagesFromRingBuffer from './ringbuf-read-msgs.js'
import * as pack      from './uint8array/pack.js'
import * as unpack    from './uint8array/unpack.js'
import { RingBuffer } from 'ringbuf.js'
import { parentPort } from 'worker_threads'


const FPS = 100
let ticks = 0
const endpoints = new Map()  // key is endpoint id, value is endpoint data structure


async function main () {
	parentPort.on('message', async function (data) {
		// control plane: messages that affect configuration and control flow
		if (data.name === 'add-endpoint') {
			const socket = dgram.createSocket('udp4')

	    	// listen for data locally
	    	await bind(socket, data.address, data.port)

	    	const address = socket.address()
	    	console.log(`Server listening at ${address.address}:${address.port}.`)

	    	// create remote endpoint
	    	const endpoint = Network.create(socket, data.address, data.port)

	    	// listen for new data on the UDP socket
	    	socket.on('message', function (message /*, rinfo*/ ) {
	        	Network.readPacket(endpoint, Stream.create(message)) // process all received data through the endpoint
	    	})

	    	// using a Map to store channels because there's no order guarantee for postMessage events
	    	// i.e., 2 or more 'add-channel' events could be received in a different order from they are sent
	    	// so just pushing them into an array would misalign the channel ids.
			endpoints.set(data.endpointId, {
				endpoint,
				channels: new Map(),
				stats: {
					// the fullest that the send and recv buffers summed for all channels has ever been
					sendHighWaterMark: 0,
					recvHighWaterMark: 0,
				}
			})

		} else if (data.name === 'remove-endpoint') {
			const { endpoint } = endpoints.get(data.endpointId)

			endpoint.socket.close()
			endpoints.delete(data.endpointId)

		} else if (data.name === 'add-channel') {
			const { endpoint, channels } = endpoints.get(data.endpointId)

			const sendRb = new RingBuffer(data.sendSab, Uint8Array)
	    	const recvRb = new RingBuffer(data.recvSab, Uint8Array)

			channels.set(data.channelId, {
				channelId: data.channelId,
				type: data.type,
				sendRb,
				recvRb,
				nextMessageLength: 0, // bytes expected for the next message in the send ringbuffer
			})

			Network.addChannel(endpoint, data.type)
		} 
	})

	// start running the tick function
	tick()
}


function tick () {
	// data plane: sending/receiving actual data

	endpoints.forEach(function ({ endpoint, channels, stats }, endpointId) {

		const dest = new Uint8Array(2)

		let sendBytes = 0
		let recvBytes = 0

		for (const [ channelId, channel ] of channels) {

			// receive messages for this channel (each message is a Uint8Array)
	        let messages = Network.readMessages(endpoint, channelId)
	        for (const m of messages) {
	        	pack.uint16(dest, 0, m.length)
	        	channel.recvRb.push(dest)
	        	channel.recvRb.push(m)
	        }

	        sendBytes += channel.sendRb.availableRead()
	        recvBytes += channel.recvRb.availableRead()

	        messages = readMessagesFromRingBuffer(channel, channel.sendRb)

			for (const m of messages)
				Network.sendMessage(endpoint, channelId, m, m.length)
		}

		stats.sendHighWaterMark = Math.max(stats.sendHighWaterMark, sendBytes)
	    stats.recvHighWaterMark = Math.max(stats.recvHighWaterMark, recvBytes)

		// package all queued messages into packets and send them over the underlying UDP socket
		Network.transmitPackets(endpoint)
		
		// broadcast stats back to the frontend for this endpoint every 5 seconds
	    if (ticks % (FPS * 5) === 0) {
		    parentPort.postMessage(JSON.stringify({
		    	name: 'endpoint-stats',
		    	endpointId,
		    	RTT: endpoint.RTT,
		    	sendSpeed: endpoint.bandwidth.sendSpeed,
		    	recvSpeed: endpoint.bandwidth.recvSpeed,
		    	sendHighWaterMark: stats.sendHighWaterMark,
		    	recvHighWaterMark: stats.recvHighWaterMark,
		    }))
		}
	})

	ticks++

	setTimeout(tick, 1000/FPS)
}


async function bind (socket, listenAddress, listenPort) {
    return new Promise(function (resolve, reject) {
        socket.bind(listenPort, listenAddress, function (er) {
            if (er)
                return reject(er)
            resolve()
        })
    })
}


main()
