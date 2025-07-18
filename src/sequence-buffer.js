// from https://gafferongames.com/post/reliable_ordered_messages/#sequence-buffers
//      https://github.com/mas-bandwidth/yojimbo/blob/main/include/yojimbo_sequence_buffer.h


/**
 * Sequence buffer constructor.
 * 
 * @param size The size of the sequence buffer.
 * @param function allocatorFn The allocator to use when intializing each entry. (optional)
 */
export function create (size, allocatorFn) {
	const entries = new Array(size)
	const entrySequence = new Int32Array(size)

	if (allocatorFn)
		for (let i=0; i < size; i++)
			entries[i] = allocatorFn()

	for (let i=0; i < size; i++)
		entrySequence[i] = -1

	return {
		size,  // max entries this sequence buffer can hold
		entrySequence,
		entries,
	}
}


 /**
  * Get the entry corresponding to a sequence number.
  * 
  * @param sb the sequence buffer
  * @param sequence The sequence number.
  * @returns The entry if it exists. null if no entry is in the buffer for this sequence number.
  */
export function find (sb, sequence) {
	const index = sequence % sb.size
	return (sb.entrySequence[index] === sequence) ? sb.entries[index] : null
}


/**
 * Insert an entry in the sequence buffer.
 * IMPORTANT: If another entry exists at the sequence modulo buffer size, it is overwritten.
 * 
 * This is the function you should use if you want to store arrays or objects as items in the 
 * sequence buffer without leaking memory. For storing primitives, insertDirect is more ergonomic
 * 
 * @param sb the sequence buffer
 * @param sequence The sequence number to insert the data into
 * @returns The sequence buffer entry, which you must fill with your data.
 */
export function insert (sb, sequence) {
	const index = sequence % sb.size
    sb.entrySequence[index] = sequence
    return sb.entries[index]
}


/**
 * Insert an entry directly in the sequence buffer.
 * IMPORTANT: If another entry exists at the sequence modulo buffer size, it is overwritten.
 * 
 * This differs from SequenceBuffer.insert in that it lets you put the data directly into the sequence buffer,
 * as opposed to having to insert it into the return structure. This is more convenient if your sequence buffer
 * stores primitive values like bools, numbers, etc.
 * DON'T USE THIS FOR ARRAYS OR OBJECTS, IT WILL LEAK MEMORY BECAUSE YOU'RE PUTING A NEW OBJECT IN EACH TIME
 * 
 * @param sb the sequence buffer
 * @param sequence The sequence number to insert the data into
 */
export function insertDirect (sb, sequence, value) {
	const index = sequence % sb.size
    sb.entrySequence[index] = sequence
    sb.entries[index] = value
}


/**
 * Remove an entry from the sequence buffer.
 * 
 * @param sb the sequence buffer
 * @param sequence The sequence number of the entry to remove.
 */
export function remove (sb, sequence) {
	const index = sequence % sb.size
	sb.entrySequence[index] = -1  // sequence numbers can't be negative so this is a good sentinel value
}


/**
 * Get the entry at the specified index
 * Use this to iterate across entries in the sequence buffer.
 * 
 * @param sb the sequence buffer
 * @param index The entry index in [0,GetSize()-1].
 * @returns The entry if it exists. NULL if no entry is in the buffer at the specified index.
 */
export function getAtIndex (sb, index) {
	return (sb.entrySequence[index] !== -1) ? sb.entries[index] : null
}
