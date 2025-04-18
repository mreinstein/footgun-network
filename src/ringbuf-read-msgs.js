import * as unpack from './uint8array/unpack.js'


const dest = new Uint8Array(2)


// keep reading messages from a ringbuffer until we run out of bytes to read
export default function readMessagesFromRingBuffer (channel, ringBuf) {
	const messages = [ ]

	// keep reading messages until we run out of bytes to read
	while (true) {
		let msgLength = 0
		if (channel.nextMessageLength) {
			msgLength = channel.nextMessageLength
		} else {
			// figure out how many bytes to read in the next message
			if (ringBuf.availableRead() >= 2) {
				ringBuf.pop(dest)
				const offsetBits = 0
				msgLength = unpack.uint16(dest, offsetBits)
				channel.nextMessageLength = msgLength
			}
		}

		// we don't have enough data to read out a message length yet
		if (!msgLength)
			break

		// we know how long the next message is but it isn't fully in the ring buffer yet
		if (ringBuf.availableRead() < msgLength)
			break

		// read the message data
		const msg = new Uint8Array(msgLength)
		ringBuf.pop(msg)
		messages.push(msg)

		// reset the next message length because we haven't read out the next 2 size bytes yet
		channel.nextMessageLength = 0
	}

	return messages
}