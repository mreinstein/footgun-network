import Alea                from 'alea'
import * as Network        from '../src/network.js'
import * as Random         from '@footgun/random-gap'
import * as SequenceBuffer from '../src/sequence-buffer.js'
import * as Stream         from '../src/uint8array/stream.js'
import { createSocket }    from 'dgram'


/**
 * Soak tests for reliable-ordered message delivery.
 * 
 * Sets up 2 endpoints, connects them via a UDP proxy with configurable traffic shaping to simulate latency, jitter, packet loss, etc.
 * Generates random messages for both endpoints to send to each other, and compares the results.
 * 
 * Runs forever unless the sent/received messages aren't perfectly aligned. If that happens the program test crashes
 * and it probably means you found a bug.
*/

const { CHANNEL_RELIABLE } = Network

// use a seeded high quality random number generator so we can reproduce tests when failures happen
const seed = Math.random()
const rng = new Alea(seed)


async function main () {
	const LOCAL_MESSAGE_BUFFER_SIZE = 32  // how many test messages to keep for testing purposes

	let tick = 0 // current simulation tick

	// control data: the sent data is generated and known ahead of time
	// maintain a rolling set of test messages that we sent out to validate everything is delivered 
	let clientRecvMessageCount = 0
	const clientSendData = SequenceBuffer.create(LOCAL_MESSAGE_BUFFER_SIZE * 10)  // tick -> messagebuf

	let serverRecvMessageCount = 0
	const serverSendData = SequenceBuffer.create(LOCAL_MESSAGE_BUFFER_SIZE * 10)  // tick -> messagebuf

	// test data: received through the network. This is what we compare the known good control data against
	const clientRecvData = SequenceBuffer.create(LOCAL_MESSAGE_BUFFER_SIZE)  // tick -> messagebuf
	const serverRecvData = SequenceBuffer.create(LOCAL_MESSAGE_BUFFER_SIZE)  // tick -> messagebuf


	// client setup
	const client = createSocket('udp4')

	const endpointS = Network.create(client, '0.0.0.0', 3000)
	Network.addChannel(endpointS, CHANNEL_RELIABLE)

	client.on('message', (msg, rinfo) => {
		// receive a packet from the server
		Network.readPacket(endpointS, Stream.create(msg))
	})

	client.bind(3001)


	// server setup
	const server = createSocket('udp4')
	const endpointC = Network.create(server, '0.0.0.0', 3000)
	Network.addChannel(endpointC, CHANNEL_RELIABLE)

	server.on('message', (msg, rinfo) => {
		// receive a packet from the client
		Network.readPacket(endpointC, Stream.create(msg))
	})

	server.bind(3002)

	// run the test!
	setInterval(function () {
		// run client logic
		let messages = Network.recvMessages(endpointS, 0)

		if (messages.length) {
			
			for (const m of messages) {
				SequenceBuffer.insertData(clientRecvData, clientRecvMessageCount, m)
				clientRecvMessageCount++
			}

			console.log('client recvd', clientRecvMessageCount, 'messages')
			for (let i=1; i < LOCAL_MESSAGE_BUFFER_SIZE; i++) {
				const mid = clientRecvMessageCount - i
				if (mid < 0)
					continue

				// compare what the client receives with what the server sent
				const control = SequenceBuffer.getData(serverSendData, mid)
				const test = SequenceBuffer.getData(clientRecvData, mid)
				if (!compareArrays(control, test))
					throw new Error(`Test failed for messageid ${mid}: server sent doesn't match what client received. seed: ${seed}`)
			}
		}

		const s = makeRandomMessage(4, 400)
		SequenceBuffer.insertData(clientSendData, tick, s)
		Network.sendMessage(endpointS, 0, s, s.byteLength)

		Network.transmitPackets(endpointS)


		// run server logic
		messages = Network.recvMessages(endpointC, 0)
		if (messages.length) {

			for (const m of messages) {
				SequenceBuffer.insertData(serverRecvData, serverRecvMessageCount, m)
				serverRecvMessageCount++
			}

			console.log('server recvd', serverRecvMessageCount, 'messages')
			for (let i=1; i < LOCAL_MESSAGE_BUFFER_SIZE; i++) {
				const mid = serverRecvMessageCount - i
				if (mid < 0)
					continue

				// compare what the client receives with what the server sent
				const control = SequenceBuffer.getData(clientSendData, mid)
				const test = SequenceBuffer.getData(serverRecvData, mid)
				if (!compareArrays(control, test))
					throw new Error(`Test failed for messageid ${mid}: client sent doesn't match what server received. seed: ${seed}`)
			}
		}

		const s2 = makeRandomMessage(4, 400)
		SequenceBuffer.insertData(serverSendData, tick, s2)
		Network.sendMessage(endpointC, 0, s2, s2.byteLength)
 
		Network.transmitPackets(endpointC)

		tick++

	}, 5)
}


function makeRandomMessage (minLength, maxLength) {
	const len = Random.int(minLength, maxLength, rng)
	const arr = new Uint8Array(len)
	for (let i=0; i < len; i++)
		arr[i] = Random.int(0, 255, rng)

	return arr
}


function compareArrays (a, b) {
	if (a.byteLength !== b.byteLength)
		return false

	for (let i=0; i < a.byteLength; i++)
		if (a[i] !== b[i])
			return false

	return true
}


main()
