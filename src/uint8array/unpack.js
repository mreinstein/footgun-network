// TODO: eventually we can do away with the float16 package. Node.js technically already has this available behind a flag, e.g.,:
//  node --js-float16array test.js 
import { getFloat16 } from '@petamoriken/float16'  // not yet available in node, ponyfill it


// from https://github.com/binaryjs/js-binarypack/blob/master/lib/binarypack.js
// and https://chatgpt.com/c/679509c8-82d0-8004-b40e-8ea63206f816


/**
 * Unpacks (reads) `bitsToRead` bits from `byteArray` at `offsetBits`.
 * @param {Uint8Array|number[]} byteArray - The array containing packed bits.
 * @param {number} offsetBits             - The current bit offset in `byteArray`.
 * @param {number} bitsToRead             - Number of bits to read.
 * @returns {number}                      - The unsigned integer value read from the bits.
 */
export function uint (byteArray, offsetBits, bitsToRead) {
    let remaining = bitsToRead
    let currentOffset = offsetBits
    let result = 0
    let shift = 0

    while (remaining > 0) {
        const byteIndex = currentOffset >>> 3
        const bitIndex = currentOffset & 7

        if (byteIndex >= byteArray.length)
            throw new Error('Byte array does not contain enough data to read.')

        // How many bits are available in this byte from bitIndex to the end
        const bitsInThisByte = Math.min(remaining, 8 - bitIndex)

        // Create a mask for these bits
        const mask = (1 << bitsInThisByte) - 1

        // Extract the portion of the byte we want
        const bitsValue = (byteArray[byteIndex] >>> bitIndex) & mask

        // Put these bits in the correct position in `result`
        // We build `result` from least significant to most significant bits
        result |= (bitsValue << shift)

        // Advance
        shift += bitsInThisByte
        currentOffset += bitsInThisByte
        remaining -= bitsInThisByte
    }

    return result
}


export function uint8 (arr, offsetBits) {
    const bitsToRead = 8
    return uint(arr, offsetBits, bitsToRead)
}


export function uint16 (arr, offsetBits) {
    const bitsToRead = 16
    return uint(arr, offsetBits, bitsToRead)
}


export function uint32 (arr, offsetBits) {
    const bitsToRead = 32
    return uint(arr, offsetBits, bitsToRead)
}


export function str (arr, offsetBits) {
    const byteIndex = Math.ceil(offsetBits/8)
    if (byteIndex + 1 > arr.byteLength)
        throw new Error('unpackString: out of range')

    const len = uint8(arr, offsetBits)

    if (byteIndex + len > arr.byteLength)
        throw new Error('unpackString: invalid length', len)

    let result = ''
    for (let i=0; i < len; i++)
        result += String.fromCharCode(uint8(arr, offsetBits + (1 + i) * 8))

    return result
}


const scratch = new DataView(new ArrayBuffer(8))


/**
 * Unpacks (reads) a 16-bit float (IEEE 754) from the given byte array at the specified bit offset.
 * Reads 2 bytes in 2 separate 8-bit chunks, then reconstructs the float16 via a DataView.
 *
 * @param {Uint8Array|number[]} byteArray   - The array containing the packed bits.
 * @param {number} offsetBits               - The current bit offset in `byteArray`.
 * @param {boolean} [littleEndian=true]     - Whether the original data was stored in little-endian format.
 * @returns {number}                        - The unpacked JS number (float16).
 */
export function float16 (byteArray, offsetBits, littleEndian = true) {
  
  let offset = offsetBits
  for (let i = 0; i < 2; i++) {
    // Read 16 bits (1 byte) at a time
    const oneByte = uint(byteArray, offset, 8)
    offset += 8
    scratch.setUint8(i, oneByte)
  }

  return getFloat16(scratch, 0, littleEndian)
}


/**
 * Unpacks (reads) a 32-bit float (IEEE 754) from the given byte array at the specified bit offset.
 * Reads 4 bytes in 4 separate 8-bit chunks, then reconstructs the float32 via a DataView.
 *
 * @param {Uint8Array|number[]} byteArray   - The array containing the packed bits.
 * @param {number} offsetBits               - The current bit offset in `byteArray`.
 * @param {boolean} [littleEndian=true]     - Whether the original data was stored in little-endian format.
 * @returns {number}                        - The unpacked JS number (float32).
 */
export function float32 (byteArray, offsetBits, littleEndian = true) {
  
  let offset = offsetBits
  for (let i = 0; i < 4; i++) {
    // Read 32 bits (1 byte) at a time
    const oneByte = uint(byteArray, offset, 8)
    offset += 8
    scratch.setUint8(i, oneByte)
  }

  return scratch.getFloat32(0, littleEndian)
}


/**
 * Unpacks (reads) a 64-bit float (IEEE 754) from the given byte array at the specified bit offset.
 * Reads 8 bytes in 8 separate 8-bit chunks, then reconstructs the float64 via a DataView.
 *
 * @param {Uint8Array|number[]} byteArray   - The array containing the packed bits.
 * @param {number} offsetBits               - The current bit offset in `byteArray`.
 * @param {boolean} [littleEndian=true]     - Whether the original data was stored in little-endian format.
 * @returns {number}                        - The unpacked JS number (float64).
 */
export function float64 (byteArray, offsetBits, littleEndian = true) {
  
  let offset = offsetBits
  for (let i = 0; i < 8; i++) {
    // Read 64 bits (1 byte) at a time
    const oneByte = uint(byteArray, offset, 8)
    offset += 8
    scratch.setUint8(i, oneByte)
  }

  return scratch.getFloat64(0, littleEndian)
}
