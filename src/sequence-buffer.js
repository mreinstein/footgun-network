// from https://gafferongames.com/post/reliable_ordered_messages/#sequence-buffers
//      https://github.com/mas-bandwidth/yojimbo/blob/main/include/yojimbo_sequence_buffer.h


export function create (maxSize) {
	return {
		maxSize,
		buffer: new Array(maxSize),  // TODO: make this a typed UintXArray
		data: new Array(maxSize)
	}
}


export function getData (sequenceBuffer, sequence) {
	const index = sequence % sequenceBuffer.maxSize
	if (sequenceBuffer.buffer[index] === sequence)
		return sequenceBuffer.data[index]
}


// returns the data object
export function insertData (sequenceBuffer, sequence, data) {
	const index = sequence % sequenceBuffer.maxSize
	sequenceBuffer.buffer[index] = sequence

	if (data !== undefined)
		sequenceBuffer.data[index] = data
	
	return sequenceBuffer.data[index]
}


export function removeData (sequenceBuffer, sequence) {
	const index = sequence % sequenceBuffer.maxSize
	sequenceBuffer.buffer[index] = -1 // sequence numbers can't be negative so this is a good empty value
}
