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

	// tick -> messagebuf
	const clientSendData = SequenceBuffer.create(LOCAL_MESSAGE_BUFFER_SIZE * 10, function () {
		return {
			len: 0, // the length of the message in bytes, from 0 to 400
			msg: new Uint8Array(1024),
		}
	})

	let serverRecvMessageCount = 0
	// tick -> messagebuf
	const serverSendData = SequenceBuffer.create(LOCAL_MESSAGE_BUFFER_SIZE * 10, function () {
		return {
			len: 0, // the length of the message in bytes, from 0 to 400
			msg: new Uint8Array(1024),
		}
	})

	// test data: received through the network. This is what we compare the known good control data against
	const clientRecvData = SequenceBuffer.create(LOCAL_MESSAGE_BUFFER_SIZE, function () {
		return {
			len: 0, // the length of the message in bytes, from 0 to 400
			msg: new Uint8Array(1024),
		}
	})  // tick -> messagebuf

	// tick -> messagebuf
	const serverRecvData = SequenceBuffer.create(LOCAL_MESSAGE_BUFFER_SIZE, function () {
		return {
			len: 0, // the length of the message in bytes, from 0 to 400
			msg: new Uint8Array(1024),
		}
	})  


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


	const messages = new Array(2048)
	for (let i=0; i < messages.length; i++) {
		messages[i] = {
			len: 0,
			msg: new Uint8Array(1024),
		}
	}

	// run the test!
	setInterval(function () {
		// run client logic
		let messageCount = Network.readMessages(endpointS, 0, messages)

		if (messageCount) {
			
			for (let i=0; i < messageCount; i++) {
				const m = messages[i]
				const s = SequenceBuffer.insert(clientRecvData, clientRecvMessageCount)
				s.msg.set(m.msg)
				s.len = m.len
				clientRecvMessageCount++
			}

			console.log('client recvd', clientRecvMessageCount, 'messages')

			for (let i=1; i < LOCAL_MESSAGE_BUFFER_SIZE; i++) {
				const mid = clientRecvMessageCount - i
				if (mid < 0)
					continue

				// compare what the client receives with what the server sent
				const control = SequenceBuffer.find(serverSendData, mid)
				const test = SequenceBuffer.find(clientRecvData, mid)

				if (!compareSequenceBufferEntries(control, test))
					throw new Error(`Test failed for messageid ${mid}: server sent doesn't match what client received. seed: ${seed}`)
			}
		}

		const s = SequenceBuffer.insert(clientSendData, tick)
		makeRandomMessage(s, 4, 400)

		Network.sendMessage(endpointS, 0, s.msg, s.len)

		Network.transmitPackets(endpointS)

		// run server logic

		messageCount = Network.readMessages(endpointC, 0, messages)

		if (messageCount) {
			
			for (let i=0; i < messageCount; i++) {
				const m = messages[i]
				const s = SequenceBuffer.insert(serverRecvData, serverRecvMessageCount)
				s.msg.set(m.msg)
				s.len = m.len
				serverRecvMessageCount++
			}

			console.log('server recvd', serverRecvMessageCount, 'messages')

			for (let i=1; i < LOCAL_MESSAGE_BUFFER_SIZE; i++) {
				const mid = serverRecvMessageCount - i
				if (mid < 0)
					continue

				// compare what the client receives with what the server sent

				const control = SequenceBuffer.find(clientSendData, mid)
				const test = SequenceBuffer.find(serverRecvData, mid)
				if (!compareSequenceBufferEntries(control, test)) {

					throw new Error(`Test failed for messageid ${mid}: client sent doesn't match what server received. seed: ${seed}`)
				}
			}
		}

		const s2 = SequenceBuffer.insert(serverSendData, tick)
		makeRandomMessage(s2, 4, 400)
		Network.sendMessage(endpointC, 0, s2.msg, s2.len)
 
		Network.transmitPackets(endpointC)

		tick++

	}, 5)
}


function makeRandomMessage (out, minLength, maxLength) {
	const len = Random.int(minLength, maxLength, rng)
	out.len = len
	for (let i=0; i < len; i++)
		out.msg[i] = Random.int(0, 255, rng)

	return out
}


// compare 2 sequence buffer entries. returns true if they match
// each sequence buffer entry is of the form { len, msg }
function compareSequenceBufferEntries (a, b) {

	if (a.len !== b.len)
		return false

	for (let i=0; i < a.len; i++)
		if (a.msg[i] !== b.msg[i])
			return false

	return true
}

main()
