import Alea                from 'alea'
import assert              from 'node:assert/strict'
import test                from 'node:test'
import { SequenceBuffer, Stream, create, addChannel, writePacket,
         readPacket, recvMessages, sendMessage,
         transmitPackets,
         CHANNEL_UNRELIABLE, CHANNEL_RELIABLE } from '../src/network.js'


// some really basic unit tests


async function main () {
	//await testOrderedReliable()
//	return // remove after testing latest 

	for (let i=0; i < 20000; i++)
		testPacketAck()

	testSend()
}


// TODO: doesn't assert anything yet :(
/*
async function testOrderedReliable () {
	const fakeSocket = {
		send: function (buf, startIdx, byteCount, port, address) {
			// noop
		}
	}
	const client = create(fakeSocket)

	addChannel(client, CHANNEL_RELIABLE)

	for (let i=0; i < 5; i++) {
		const s = Stream.create()
		Stream.write.uint32(s, 319 + i)
		sendMessage(client, 0, s, 4)
	}

	await delay(100)

	transmitPackets(client)

	//const server = create()
	//addChannel(server, CHANNEL_RELIABLE)

}
*/


async function delay (ms) {
	return new Promise(function (resolve/*, reject*/) {
		setTimeout(resolve, ms)
	})
}



function testSend () {

	// basic test
	{
		const client = create()
		addChannel(client, CHANNEL_UNRELIABLE)

		const channelId = 0
		for (let i=0; i < 5; i++) {
			const s = Stream.create()
			for (let j=0; j < i; j++)
				Stream.write.uint8(s, i)
			const byteLength = Math.ceil(s.offsetBits / 8)
			sendMessage(client, channelId, s.buf, byteLength)
		}

		assert.strictEqual(client.channels[0].messageSendBuffer.size, 5, `message send buffer should contain all the messages`)
		assert.strictEqual(client.channels[0].nextMessageId, 5, `message send buffer should have 5 as it's next message id`)

		const s = Stream.create()
		const wroteData = writePacket(client, s)

		const byteCount = Math.ceil(s.offsetBits / 8)
		
		assert.strictEqual(client.channels[0].messageSendBuffer.size, 0, `message send buffer should fully drain`)
	}

	// ensure packets don't overfill
	{
		const client = create()
		addChannel(client, CHANNEL_UNRELIABLE)

		const channelId = 0
		for (let i=0; i < 5; i++) {
			const s = Stream.create()
			Stream.write.uint8(s, 33)
			for (let j=1; j < 256; j++)
				Stream.write.uint8(s, i)
			const byteLength = Math.ceil(s.offsetBits / 8)
			sendMessage(client, channelId, s.buf, byteLength)
		}

		const s = Stream.create()
		const wroteData = writePacket(client, s)

		assert.strictEqual(client.channels[0].messageSendBuffer.size, 2)

		const byteCount = Math.ceil(s.offsetBits / 8)
		assert.strictEqual(byteCount, 785)

		// try receiving this packet and validate we can read the messages
		const server =  create()
		addChannel(server, CHANNEL_UNRELIABLE)

		s.offsetBits = 0
		readPacket(server, s)

		const messages = recvMessages(server, channelId)
		assert.strictEqual(messages.length, 3)
	}
}


function testPacketAck () {
	const client = create()
	addChannel(client, CHANNEL_UNRELIABLE)

	const server = create()
	addChannel(server, CHANNEL_UNRELIABLE)

	const seed = Math.random() //'0.9794204297040408'
	//console.log('seed:', seed)
	const rng = new Alea(seed)

	// generate a random stream of data, random packet drops,
	// and verify the data structures are right
	const packetsToSend = 32
	const serverLostChance = 0.15  // % chance of server losing packets 0.1 == 10%
	const serverLost = [ ]
	for (let i=0; i < packetsToSend; i++)
		serverLost.push(rng() <= serverLostChance)

	// TODO: lost packets on the client too

	for (const wasLost of serverLost) {
		makeAndSendPacket(client, server, wasLost)
		makeAndSendPacket(server, client)
	}

	assert.strictEqual(client.packet.nextSequence, packetsToSend)

	assert.strictEqual(client.packet.newestReceivedPacketSeq, packetsToSend - 1)


	for (let i=0; i < packetsToSend; i++) {
		const wasServerLost = serverLost[i]

		let acked = SequenceBuffer.getData(client.packet.sent, i)
	
		if (acked === wasServerLost)
			throw new Error(`client.packet.sent[${i}].acked: ${acked}`)

		acked = SequenceBuffer.getData(client.packet.recvd, i)
		if (!acked)
			throw new Error(`client.packet.recv[${i}].acked: ${acked}`)
	}

	// validate server state
	assert.strictEqual(server.packet.nextSequence, packetsToSend)

	const lastIdx = serverLost.lastIndexOf(false)
	assert.strictEqual(server.packet.newestReceivedPacketSeq, lastIdx)
	
	// get the last packet that was sent to the server successfully.
	// all packets before that should be acked on the server
	for (let i=0; i < lastIdx; i++) {
		//const wasServerLost = serverLost[i]
		let acked = SequenceBuffer.getData(server.packet.sent, i)
		if (!acked)
			throw new Error(`server.packet.sent[${i}].acked: ${acked}`)
	}
}


// helper function to simulate sending a new packet from one endpoint to another
function makeAndSendPacket (from, to, lost=false) {
	const s = Stream.create()
	writePacket(from, s)

	s.offsetBits = 0  // reset the position in the stream so we can read from the beginning

	if (!lost)
		readPacket(to, s)
}


main()
