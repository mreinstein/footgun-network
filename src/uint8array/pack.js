// TODO: eventually we can do away with the float16 package. Node.js technically already has this available behind a flag, e.g.,:
//  node --js-float16array test.js 
import { setFloat16 } from '@petamoriken/float16'  // not yet available in node, ponyfill it


// from https://github.com/binaryjs/js-binarypack/blob/master/lib/binarypack.js
// and https://chatgpt.com/c/679509c8-82d0-8004-b40e-8ea63206f816


/**
 * Packs `bitsToWrite` bits from `value` into `byteArray` at `offsetBits`.
 * @param {Uint8Array|number[]} byteArray   - The array where bits will be stored.
 * @param {number} offsetBits               - The current bit offset in `byteArray`.
 * @param {number} value                    - The unsigned nteger value to pack.
 * @param {number} bitsToWrite              - Number of bits from `value` to store.
 * @returns {number}                        - The new bit offset after writing.
 */
export function uint (byteArray, offsetBits, value, bitsToWrite) {
  let remaining = bitsToWrite;
  let currentOffset = offsetBits;
  let localValue = value;

  while (remaining > 0) {
    // Which byte index and bit index within that byte
    const byteIndex = currentOffset >>> 3; // = Math.floor(currentOffset / 8)
    const bitIndex = currentOffset & 7;    // = currentOffset % 8

    if (byteIndex >= byteArray.length)
      throw new Error('Byte array is too small for the requested offset.');

    // How many bits we can fit into the current byte from `bitIndex` to the end of the byte
    const bitsInThisByte = Math.min(remaining, 8 - bitIndex);

    // Create a mask for these bits (e.g., if bitsInThisByte=3, mask=0b111=7)
    const mask = (1 << bitsInThisByte) - 1;

    // Extract the portion of `value` that fits in this chunk (lowest bitsInThisByte bits)
    const bitsValue = localValue & mask;

    // Shift those bits so they line up with `bitIndex`
    const shiftedBits = bitsValue << bitIndex;

    // 1) Clear those bits from the current byte so we can overwrite:
    //    - We need a mask that zeros out exactly the `bitsInThisByte` starting at `bitIndex`.
    //    - Example: if bitIndex=2 and bitsInThisByte=3, we create (mask=0b111=7) << 2 = 0b11100=28.
    //      Then invert it (~) to get 0b00011. We'll AND with that to clear only those bits.
    const clearMask = ~(((1 << bitsInThisByte) - 1) << bitIndex);
    byteArray[byteIndex] &= clearMask;

    // 2) Now OR in the new bits
    byteArray[byteIndex] |= shiftedBits;

    // Discard the bits we've just stored
    localValue >>>= bitsInThisByte;

    // Advance our offsets
    currentOffset += bitsInThisByte;
    remaining -= bitsInThisByte;
  }

  return currentOffset;
}


export function uint8 (arr, offsetBits, num) {
    const bitsToWrite = 8
    uint(arr, offsetBits, num, bitsToWrite)
}


export function uint16 (arr, offsetBits, num) {
    const bitsToWrite = 16
    uint(arr, offsetBits, num, bitsToWrite)
}


export function uint32 (arr, offsetBits, num) {
    const bitsToWrite = 32
    uint(arr, offsetBits, num, bitsToWrite)
}


export function str (arr, offsetBits, val) {
    if (val.length > 255)
        throw new Error(`Can't pack string with more than 255 characters.`)

    uint8(arr, offsetBits, val.length)
    for (let i=0; i < val.length; i++)
        uint8(arr, offsetBits + (1 + i) * 8, val.charCodeAt(i))
}


const scratch = new DataView(new ArrayBuffer(8))


/**
 * Packs a 16-bit float (IEEE 754) into the provided byte array at the given bit offset.
 * Internally breaks the float into 2 bytes, then stores each byte with 8 bits.
 *
 * @param {Uint8Array|number[]} byteArray   - The array where bits will be stored.
 * @param {number} offsetBits               - The current bit offset in `byteArray`.
 * @param {number} float16Value             - The JS number (float16) to pack.
 * @param {boolean} [littleEndian=true]     - Whether to store in little-endian format.
 * @returns {number} - The new bit offset after writing 16 bits.
 */
export function float16 (byteArray, offsetBits, float16Value, littleEndian = true) {
  // Write the float16 into the DataView
  setFloat16(scratch, 0, float16Value, littleEndian)

  let offset = offsetBits

  // Each of the 2 bytes is 8 bits
  for (let i = 0; i < 2; i++) {
    // getUint8(i) retrieves one byte
    const byte = scratch.getUint8(i)
    offset = uint(byteArray, offset, byte, 8)
  }

  return offset;
}


/**
 * Packs a 32-bit float (IEEE 754) into the provided byte array at the given bit offset.
 * Internally breaks the float into 4 bytes, then stores each byte with 8 bits.
 *
 * @param {Uint8Array|number[]} byteArray   - The array where bits will be stored.
 * @param {number} offsetBits               - The current bit offset in `byteArray`.
 * @param {number} float32Value             - The JS number (float32) to pack.
 * @param {boolean} [littleEndian=true]     - Whether to store in little-endian format.
 * @returns {number} - The new bit offset after writing 32 bits.
 */
export function float32 (byteArray, offsetBits, float32Value, littleEndian = true) {
  // Write the float32 into the DataView
  scratch.setFloat32(0, float32Value, littleEndian)

  let offset = offsetBits

  // Each of the 4 bytes is 8 bits
  for (let i = 0; i < 4; i++) {
    // getUint8(i) retrieves one byte
    const byte = scratch.getUint8(i)
    offset = uint(byteArray, offset, byte, 8)
  }

  return offset;
}


/**
 * Packs a 64-bit float (IEEE 754) into the provided byte array at the given bit offset.
 * Internally breaks the float into 8 bytes, then stores each byte with 8 bits.
 *
 * @param {Uint8Array|number[]} byteArray   - The array where bits will be stored.
 * @param {number} offsetBits               - The current bit offset in `byteArray`.
 * @param {number} float64Value             - The JS number (float64) to pack.
 * @param {boolean} [littleEndian=true]     - Whether to store in little-endian format.
 * @returns {number} - The new bit offset after writing 64 bits.
 */
export function float64 (byteArray, offsetBits, float64Value, littleEndian = true) {

  // Write the float64 into the DataView
  scratch.setFloat64(0, float64Value, littleEndian)

  let offset = offsetBits

  // Each of the 8 bytes is 8 bits
  for (let i = 0; i < 8; i++) {
    // getUint8(i) retrieves one byte
    const byte = scratch.getUint8(i)
    offset = uint(byteArray, offset, byte, 8)
  }

  return offset;
}

