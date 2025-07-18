import * as SequenceBuffer from './sequence-buffer.js'
import * as Stream         from './uint8array/stream.js'
import * as constants      from './constants.js'


const { CHANNEL_UNRELIABLE, CHANNEL_RELIABLE, LIMIT_MESSAGES_PER_PACKET, MAX_PACKET_BITS } = constants


// write a packet to a stream and update local packet ack state
// @param endpoint  endpoint
// @param s        writable stream
// @return boolean true if any data fit into the packet, false otherwise
export default function writePacket (endpoint, s) {

	// Insert an entry for the current send packet sequence number in the sent packet sequence buffer
	// with data indicating that it hasn’t been acked yet
	SequenceBuffer.insertDirect(endpoint.packet.sent, endpoint.packet.nextSequence, false)

	// Generate ack and ack_bits from the contents of the local received packet sequence buffer and the
	// most recent received packet sequence number
	const ack = (endpoint.packet.newestReceivedPacketSeq >= 0) ? endpoint.packet.newestReceivedPacketSeq : 0

	// Fill the packet header with sequence, ack and ack_bits
	Stream.write.uint32(s, endpoint.packet.nextSequence)

	Stream.write.uint32(s, ack)

	if (endpoint.packet.newestReceivedPacketSeq >= 0) {
		for (let i=0; i < 32; i++) {
			let ackBit = 0

			// the first 31 sent packets that send over this connection won't be able to fill ackBits with 32 values
			if (ack - i >= 0) {
				const d = SequenceBuffer.find(endpoint.packet.recvd, ack - i)
				if (d)
					ackBit = 1
			}

			Stream.write.uint(s, ackBit, 1)
		}
	} else {
		Stream.write.uint32(s, 0)
	}


	// write channel data
	//                      message count for the current channel (8 bits)
	const channelMetaBits = 8 * endpoint.channels.length

	let availableBits = MAX_PACKET_BITS - channelMetaBits - s.offsetBits

	let packetMessageCount = 0 // how many messages are written to the packet
	let written = 0

	for (let i=0; i < endpoint.channels.length;i++) {

		// prevent more messages from going into the packet than can be represented by the length field
		if (packetMessageCount === LIMIT_MESSAGES_PER_PACKET)
			break

		const channel = endpoint.channels[i]
		let messageCount = 0  // how many messages were written for this channel
		const messageCountOffsetBits = s.offsetBits // where in the stream the message count for this channel is stored

		Stream.write.uint8(s, messageCount) // placeholder for the message count of this channel

		if (channel.type === CHANNEL_UNRELIABLE) {
			// fill in all packets that will fit and remove them from the send queue
			for (let j=0; j < channel.messageSendBuffer.size; j++) {
				const m = SequenceBuffer.getAtIndex(channel.messageSendBuffer, j)
				if (m) {
					const payloadByteLength = m.len
					const bitLength = (payloadByteLength * 8) + 10 // messageLength encoded as 10 bits
					if (bitLength <= availableBits) {
						Stream.write.uint(s, payloadByteLength, 10)
						Stream.write.arr(s, m.msg, payloadByteLength)

						const msgId = channel.messageSendBuffer.entrySequence[j]
						SequenceBuffer.remove(channel.messageSendBuffer, msgId)
						availableBits -= bitLength
						messageCount++
						packetMessageCount++
					}
				}
			}
			
		} else if (channel.type === CHANNEL_RELIABLE) {

			// track the ids of all reliable messages added to this packet
			// so they can be used to map packet level acks to the set of messages included in that packet.
			const ss = SequenceBuffer.insert(channel.packetMessages, endpoint.packet.nextSequence)
			ss.len = 0
	
			/*
			From https://gafferongames.com/post/reliable_ordered_messages/#reliable-ordered-message-algorithm

			under the "on packet send" section:

				Never send a message id that the receiver can’t buffer or you’ll break message acks (since that message won’t
				be buffered, but the packet containing it will be acked, the sender thinks the message has been received, and
				will not resend it). This means you must never send a message id equal to or more recent than the oldest
				unacked message id plus the size of the message receive buffer.
	    	*/
			const maxMessageIdToSend = Math.min(
				channel.nextMessageId,
				channel.oldestUnackedMessageId + channel.messageRecvBuffer.size // the receiver can't buffer this message id
			)

			// Walk across the set of messages in the send message sequence buffer between the oldest unacked message id and
			// the most recent inserted message id from left -> right (increasing message id order).
			for (let mid=channel.oldestUnackedMessageId; mid < maxMessageIdToSend; mid++) {

				const m = SequenceBuffer.find(channel.messageSendBuffer, mid)
				if (m) {
					/*
					For any message that hasn’t been sent in the last 0.1 seconds and fits in the available space we have left in
					the packet, add it to the list of messages to send. Messages on the left (older messages) naturally have
					priority due to the iteration order.

					Include the messages in the outgoing packet and add a reference to each message.
					*/
					const dt = performance.now() - SequenceBuffer.find(channel.messageLastSent, mid)
					if (dt > 100) {
						const payloadByteLength = m.len
						const bitLength = (payloadByteLength * 8) + 10 + 32 // messageLength (10 bits) messageid (32 bits)
						if (bitLength <= availableBits) {
							// allows us to look up later upon packet ack which reliable messageids arrived
							ss.messageids[ss.len] = mid
							ss.len++

							SequenceBuffer.insertDirect(channel.messageLastSent, mid, performance.now())
							Stream.write.uint(s, payloadByteLength, 10)
							Stream.write.uint32(s, mid)
							Stream.write.arr(s, m.msg, payloadByteLength)
							availableBits -= bitLength
							messageCount++
							packetMessageCount++
						}
					}
				}
			}
		}

		// now that we have the real count of how many messages fit into the packet, set that in the packet
		const tmp = s.offsetBits
		s.offsetBits = messageCountOffsetBits
		Stream.write.uint8(s, messageCount)
		s.offsetBits = tmp

		written += messageCount
	}

	SequenceBuffer.insertDirect(endpoint.packet.lastSent, endpoint.packet.nextSequence, performance.now())

	endpoint.packet.nextSequence++

	return written > 0
}
