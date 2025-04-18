import * as SequenceBuffer from './sequence-buffer.js'
import * as Stream         from './uint8array/stream.js'
import * as constants      from './constants.js'
export *                   from './constants.js'
export * as SequenceBuffer from './sequence-buffer.js'
export * as Stream         from './uint8array/stream.js'
export * as pack           from './uint8array/pack.js'
export * as unpack         from './uint8array/unpack.js'
import writePacket         from './write-packet.js'


// @footgun/networking library. Exposes public API


const { CHANNEL_UNRELIABLE, CHANNEL_RELIABLE, LIMIT_MESSAGES_PER_PACKET, MAX_PACKET_BITS } = constants

const ackedPacketsBufferSize = 256    // Number of packet entries in the acked packet buffer. Consider your packet send rate and aim to have at least a few seconds worth of entries.
const receivedPacketsBufferSize = 256 // Number of packet entries in the received packet sequence buffer. Consider your packet send rate and aim to have at least a few seconds worth of entries. 
const maxMessageBits = 768 * 8        // Somewhat arbitrary but lower than max packet size. leaves considerable room for packet header overhead. 


/**
 * create a network endpoint, which is essentially a UDP connection to a specific address/port combo.
 * 
 * @param {object} socket UDP dgram instance created by node.js
 * @param {string} address dotted ipv4 remote address
 * @param {number} port remote port
 * @return {object} created and initialized endpoint data structure
 */
export function create (socket, address, port) {
	return {
		socket,
		address,
		port,
		packet: {
			nextSequence: 0, // the next packet sequenceId to send
			sent: SequenceBuffer.create(ackedPacketsBufferSize),  // tracks which packets this endpoint sent were acked by receiver
			recvd: SequenceBuffer.create(receivedPacketsBufferSize), // packetids that were received from the other endpoint
			newestReceivedPacketSeq: -1,  // packet id of the newest packet received
			lastSent: SequenceBuffer.create(ackedPacketsBufferSize), // packetId -> timeOfPacketSend (in milliseconds)
		},
		channels: [ ],
		RTT: 0.0,  // smoothed round-trip-time in milliseconds
		bandwidth: {
			sendData: [ ], // [ { time: <timestamp>, bytes: <number of bytes> }, ... ]
			recvData: [ ], // [ { time: <timestamp>, bytes: <number of bytes> }, ... ]
			sendSpeed: 0, // bytes/second
			recvSpeed: 0, // bytes/second
		},
	}
}


export function addChannel (endpoint, type) {

    const channel = {
    	type,                         // CHANNEL_UNRELIABLE | CHANNEL_RELIABLE
    	messageSendBuffer: new Map(), // messageid -> { message, byteLength }

		// messageid starts at 0 and increases with each message sent.
		nextMessageId: 0, // id to use for the next message to be sent
    }

    if (type === CHANNEL_RELIABLE) {
    	// https://github.com/mas-bandwidth/yojimbo/blob/d8722261c7a93867c6c95c221966c714d4048b6f/include/yojimbo_reliable_ordered_channel.h#L366C9-L367C9

    	channel.messageRecvBuffer = new Map() // messageid -> [ data (Uint8Array), byteLength ]

    	channel.nextMessageReceiveId = 0 // the next message to receive from the messageRecvBuffer
    	channel.oldestUnackedMessageId = 0 // Id of the oldest unacked message in the send queue.
    	channel.messageLastSent = SequenceBuffer.create(1024) // messageId -> timeOfLastSend (in milliseconds)

    	// Stores information per sent connection packet about messages included in each packet. Used to walk from connection packet level acks to message level acks.
    	channel.packetMessages = SequenceBuffer.create(1024) // packetid -> [ messageids sent in this packet ]
    }
    else if (type === CHANNEL_UNRELIABLE) {
		channel.recvdMessages = [ ] // each message in this array is a Uint8Array of bytes 
    }

	endpoint.channels.push(channel)
}


// queue a message for sending
// @param Uint8Array message
// @param Number byteLength how many bytes of message to send
export function sendMessage (endpoint, channelId, message, byteLength) {
	if (byteLength > Math.ceil(maxMessageBits / 8))
		throw new Error(`Message size is too large, exceeds limit of ${Math.ceil(maxMessageBits/8)} bytes`)

	const channel = endpoint.channels[channelId]
	channel.messageSendBuffer.set(channel.nextMessageId, { message, byteLength })

	if (channel.type === CHANNEL_RELIABLE)
		SequenceBuffer.insertData(channel.messageLastSent, channel.nextMessageId, 0) // set initial send timestamp to 0

	channel.nextMessageId++
}


// generate packets and send them over an endpoint's UDP socket
export function transmitPackets (endpoint) {
	while (hasAvailableData(endpoint)) {
		const s = Stream.create()
		const wrote = writePacket(endpoint, s)
		const byteCount = Math.ceil(s.offsetBits / 8)
		endpoint.socket.send(s.buf, 0, byteCount, endpoint.port, endpoint.address)

		updateBandwidth(endpoint, 'send', byteCount)
	}
}


// determine if at least 1 channel has data ready to send
function hasAvailableData (endpoint) {

	const channelMetaBits = 8 * endpoint.channels.length
	const availableBits = MAX_PACKET_BITS - channelMetaBits

	for (let i=0; i < endpoint.channels.length;i++) {
		const channel = endpoint.channels[i]
	
		if (channel.type === CHANNEL_UNRELIABLE) {
			for (const [ msgId, payload ] of channel.messageSendBuffer) {
				const bitLength = (payload.byteLength * 8) + 10 // messageLength encoded as 10 bits
				if (bitLength <= availableBits)
					return true
			}
			
		} else if (channel.type === CHANNEL_RELIABLE) {
			// Walk across the set of messages in the send message sequence buffer between the oldest unacked message id and
			// the most recent inserted message id from left -> right (increasing message id order).
			for (let mid=channel.oldestUnackedMessageId; mid < channel.nextMessageId; mid++) {
				const m = channel.messageSendBuffer.get(mid)
				if (m) {
					const dt = performance.now() - SequenceBuffer.getData(channel.messageLastSent, mid)
					if (dt > 100) {
						const bitLength = (m.byteLength * 8) + 10 + 32 // messageLength encoded as 10 bits
						if (bitLength <= availableBits)
							return true
					}
				}
			}
		}
	}

	return false
}


// read a packet from a stream and update packet ack state
// @param endpoint  endpoint
// @param s        writable stream
export function readPacket (endpoint, s) {
	// read the packet header info
	const seqId = Stream.read.uint32(s)     // this packet's sequence number
	const ack = Stream.read.uint32(s)       // newest packet sequence number received by the sender
	//const ackBits = Stream.read.uint32(s) // 32 packets prior to the newest packetId

	// if this packet has a newer sequence number, update it in our data structure
	endpoint.packet.newestReceivedPacketSeq = Math.max(endpoint.packet.newestReceivedPacketSeq, seqId)

	// mark this packet's sequence number as having been received
	SequenceBuffer.insertData(endpoint.packet.recvd, seqId, true)

	// decode the set of ack'd sequence numbers from ack and ackBits
	// informs us which packet ids have definitely received from this endpoint
	for (let i=0; i < 32; i++) {
		const ackedNow = !!Stream.read.uint(s, 1) // read 1 dang bit

		const packetid = ack - i

		// the first 31 sent packets won't be able to fill ackBits with 32 values
		if (packetid < 0)
			continue
		
		const wasAcked = SequenceBuffer.getData(endpoint.packet.sent, packetid)
		SequenceBuffer.insertData(endpoint.packet.sent, packetid, ackedNow)

		if (wasAcked || !ackedNow)
			continue

		// packet was acked just now

		if (i === 0) {
			// update round trip time
			const sampleRtt = performance.now() - SequenceBuffer.getData(endpoint.packet.lastSent, packetid)
			const alpha = 0.125
			if (endpoint.RTT === 0)
		      endpoint.RTT = sampleRtt
		    else
		      endpoint.RTT = (1 - alpha) * endpoint.RTT + alpha * sampleRtt
		}

		for (let j=0; j < endpoint.channels.length; j++) {
			const channel = endpoint.channels[j]

			if (channel.type === CHANNEL_RELIABLE) {
				// Look up the set of messages ids included in the packet
				// Remove those messages from the message send queue if they exist.
				const mids = SequenceBuffer.getData(channel.packetMessages, packetid)
				for (const mid of mids)
					channel.messageSendBuffer.delete(mid)
				
				// Update the last unacked message id by walking forward from the previous unacked message id in
				// the send message sequence buffer until a valid message entry is found, or you reach the current
				// send message id. Whichever comes first.
				for (let mid=channel.oldestUnackedMessageId; mid < channel.nextMessageId; mid++) {
					const msg = channel.messageSendBuffer.get(mid)

					if (!msg)
						channel.oldestUnackedMessageId = mid + 1// message isn't in send queue, it must have been acked, advance
					else
						break  // message is still in the send queue so it hasn't been acked yet
				}
			}
		}
	}

	for (let i=0; i < endpoint.channels.length;i++) {
		const channel = endpoint.channels[i]
		const messageCount = Stream.read.uint8(s)

		for (let i=0; i < messageCount; i++) {
			const messageLength = Stream.read.uint(s, 10)  // how many bytes are in the message

			if (channel.type === CHANNEL_UNRELIABLE) {
				const m = Stream.read.arr(s, messageLength)	
				channel.recvdMessages.push(m)
			}
			else if (channel.type === CHANNEL_RELIABLE) {
				const mid = Stream.read.uint32(s)
				const m = Stream.read.arr(s, messageLength)
				channel.messageRecvBuffer.set(mid, { message: m, byteLength: messageLength })
			}	
		}
	}

	updateBandwidth(endpoint, 'recv', Math.ceil(s.offsetBits/8))
}


// get all available messages from the channel.  Each message is a Uint8Array
export function readMessages (endpoint, channelId) {
	const channel = endpoint.channels[channelId]

	let messages = [ ]

	if (channel.type === CHANNEL_UNRELIABLE) {
		messages = [ ...channel.recvdMessages ]

		// delivered the messages, can empty out the local buffer
		channel.recvdMessages.length = 0

	} else if (channel.type === CHANNEL_RELIABLE) {
		/*
		Check the receive message sequence buffer to see if a message exists for the current receive message id.

		If the message exists, remove it from the receive message sequence buffer, increment the receive message
		id and return a pointer to the message.

		Otherwise, no message is available to receive. Return NULL.
		*/
		for (let mid=channel.nextMessageReceiveId; ; mid++) {
			const m = channel.messageRecvBuffer.get(mid)
			if (!m)
				break

			messages.push(m.message)
			channel.nextMessageReceiveId = mid + 1
		}
	}

	return messages
}


// calculate instantaneous bandwidth using sliding window
// @param String type  send | recv
function updateBandwidth (endpoint, type, byteCount) {
	
	const now = performance.now()  // current time in milliseconds

	// Define the sliding window duration (in milliseconds)
	const slidingWindowMs = 1000
  
  	const dataPoints = endpoint.bandwidth[`${type}Data`]

	// Add the new data point to the history
	dataPoints.push({ time: now, bytes: byteCount })

	// Remove data points older than the sliding window
	while (dataPoints.length && (now - dataPoints[0].time > slidingWindowMs))
		dataPoints.shift()

	// Calculate the sum of bytes in the current sliding window
	const bytesSum = dataPoints.reduce((sum, point) => sum + point.bytes, 0)

	// Determine the duration of the current window in seconds.
	// If there is only one data point, the window might be less than slidingWindowMs.
	const windowDurationSeconds = (now - dataPoints[0].time) / 1000

	// Compute instantaneous speed in bytes per second (avoid division by zero)
	const instantaneousSpeed = windowDurationSeconds > 0 ? bytesSum / windowDurationSeconds : 0

	endpoint.bandwidth[`${type}Speed`] = instantaneousSpeed
}
