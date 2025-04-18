import * as constants from './constants.js'
export *              from './constants.js'
import readMessagesFromRingBuffer from './ringbuf-read-msgs.js'
import * as pack      from './uint8array/pack.js'
import * as unpack    from './uint8array/unpack.js'
import { RingBuffer } from 'ringbuf.js'
import { Worker }     from 'worker_threads'


// TODO: how do we expose the rinfo object?

// TODO: expose a GC friendly interface for reading messages instead of allocating an array each time:
//       const dest = [ Uint8Array, Uint8Array, Uint8Array, ...]  // fixed size
//       readCount = Network.readMessages(endpoint, channelId, dest)

// TODO: input validation on all parameters in the worker thread. Throw postMessage('error') when things go awry


export function create () {
	const worker = new Worker(import.meta.dirname + '/worker.js')

	const endpoints = [ ]

	worker.on('message',function (message) {
		message = JSON.parse(message)
		if (message.name === 'endpoint-stats') {
			const e = endpoints[message.endpointId]
			if (e) {
				e.stats.RTT = message.RTT
				e.stats.sendSpeed = message.sendSpeed
				e.stats.recvSpeed = message.recvSpeed
				e.stats.sendHighWaterMark = message.sendHighWaterMark
				e.stats.recvHighWaterMark = message.recvHighWaterMark
				console.log(message, 'st:', e.stats)
			}
		}
	})

	return {
		endpoints,
		worker,
	}
}


export function addEndpoint (network, address, port) {

	const endpointId = network.endpoints.length

	network.worker.postMessage({
		name: 'add-endpoint',
		endpointId,
		address,
		port,
	})


	const endpoint = {
		endpointId,
		address,
		port,

		channels: [ ],

		stats: {
			RTT: 0,        // smoothed round-trip-time in milliseconds
			sendSpeed: 0,  // bytes/second
			recvSpeed: 0,  // bytes/second

			// the fullest that the send and recv buffers summed for all channels has ever been
			sendHighWaterMark: 0,
			recvHighWaterMark: 0,
		},
	}

	network.endpoints.push(endpoint)

	return endpoint
}


export function removeEndpoint (network, endpoint) {
	network.worker.postMessage({
		name: 'remove-endpoint',
		endpointId: endpoint.endpointId,
	})
}


// create a bidirectional channel to send/receive data
export function addChannel (network, endpoint, type) {
	// construct the shared array buffers here for send and recv
	// https://gist.github.com/mreinstein/04d58f4bffabb334c041396bbf8a7ce0#file-main-js-L10
	const BUFFER_SIZE = 1024 * 1024 * 4 // assumes 1Mbit transmit rate for 4 seconds
    const sendSab = RingBuffer.getStorageForCapacity(BUFFER_SIZE, Uint8Array)
	const sendRb = new RingBuffer(sendSab, Uint8Array)

	const recvSab = RingBuffer.getStorageForCapacity(BUFFER_SIZE, Uint8Array)
	const recvRb = new RingBuffer(recvSab, Uint8Array)

	const channelId = endpoint.channels.length

	endpoint.channels.push({
		type,
		channelId,
		sendRb,
		recvRb,
		nextMessageLength: 0, // bytes expected for the next message in the recv ringbuffer
	})

	network.worker.postMessage({
		name: 'add-channel',
		endpointId: endpoint.endpointId,
		channelId,
		type,
		sendSab,
		recvSab,
	})

	return channelId
}


export function sendMessage (endpoint, channelId, data, length=0) {
	const channel = endpoint.channels[channelId]

	const msgLength = new Uint8Array(2)
	const offsetBits = 0
	pack.uint16(msgLength, offsetBits, length || data.length)
	channel.sendRb.push(msgLength)

	channel.sendRb.push(data, length || data.length)
}


export function readMessages (endpoint, channelId) {
	const channel = endpoint.channels[channelId]
	return readMessagesFromRingBuffer(channel, channel.recvRb)
}
