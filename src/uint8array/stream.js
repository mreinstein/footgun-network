import * as pack   from './pack.js'
import * as unpack from './unpack.js'


export function create (buf) {
	return {
		buf: buf || new Uint8Array(1024),
		offsetBits: 0, // current bit offset being read/written
	}
}


export function reset (stream) {
	stream.offsetBits = 0
}


// TODO: guard against reading or writing past the buffer length (1024)

export const read = {
	uint: function (stream, bitsToRead) {
		// TODO: assert bitsToRead is > 0
		stream.offsetBits += bitsToRead
		return unpack.uint(stream.buf, stream.offsetBits - bitsToRead, bitsToRead)
	},
	uint8: function (stream) {
		const bitsToRead = 8
		stream.offsetBits += bitsToRead
		return unpack.uint(stream.buf, stream.offsetBits - bitsToRead, bitsToRead)
	},
	uint16: function (stream) {
		const bitsToRead = 16
		stream.offsetBits += bitsToRead
		return unpack.uint(stream.buf, stream.offsetBits - bitsToRead, bitsToRead)
	},
	uint32: function (stream) {
		const bitsToRead = 32
		stream.offsetBits += bitsToRead
		return unpack.uint(stream.buf, stream.offsetBits - bitsToRead, bitsToRead)
	},
	float16: function (stream) {
		const bitsToRead = 16
		stream.offsetBits += bitsToRead
		return unpack.float16(stream.buf, stream.offsetBits - bitsToRead)
	},
	float32: function (stream) {
		const bitsToRead = 32
		stream.offsetBits += bitsToRead
		return unpack.float32(stream.buf, stream.offsetBits - bitsToRead)
	},
	float64: function (stream) {
		const bitsToRead = 64
		stream.offsetBits += bitsToRead
		return unpack.float64(stream.buf, stream.offsetBits - bitsToRead)
	},

	// TODO: support strings

	// TODO: does it make sense to send bitCount instead?
	// might be nice to be able to send/receive arrays not aligned on byte boundaries
	arr: function (stream, byteCount) {
		const bitsToRead = 8
		const dest = new Uint8Array(byteCount)
		for (let i=0; i < byteCount; i++) {
			dest[i] = unpack.uint(stream.buf, stream.offsetBits, bitsToRead)
			stream.offsetBits += bitsToRead
		}
		return dest
	}
}


export const write = {
	uint: function (stream, num, bitsToWrite) {
		pack.uint(stream.buf, stream.offsetBits, num, bitsToWrite)
		stream.offsetBits += bitsToWrite
	},
	uint8: function (stream, num) {
		const bitsToWrite = 8
		pack.uint(stream.buf, stream.offsetBits, num, bitsToWrite)
		stream.offsetBits += bitsToWrite
	},
	uint16: function (stream, num) {
		const bitsToWrite = 16
		pack.uint(stream.buf, stream.offsetBits, num, bitsToWrite)
		stream.offsetBits += bitsToWrite
	},
	uint32: function (stream, num) {
		const bitsToWrite = 32
		pack.uint(stream.buf, stream.offsetBits, num, bitsToWrite)
		stream.offsetBits += bitsToWrite
	},
	float16: function (stream, num) {
		pack.float16(stream.buf, stream.offsetBits, num)
		stream.offsetBits += 16
	},
	float32: function (stream, num) {
		pack.float32(stream.buf, stream.offsetBits, num)
		stream.offsetBits += 32
	},
	float64: function (stream, num) {
		pack.float64(stream.buf, stream.offsetBits, num)
		stream.offsetBits += 64
	},
	arr: function (stream, src, byteCount) {
		const bitsToWrite = 8
		for (let i=0; i < byteCount; i++) {
			pack.uint(stream.buf, stream.offsetBits, src[i], bitsToWrite)
			stream.offsetBits += 8
		}
	},
}
