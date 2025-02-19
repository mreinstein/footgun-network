import * as pack   from '../src/uint8array/pack.js'
import * as unpack from '../src/uint8array/unpack.js'


const msg = new Uint8Array(32)


///////////////
// TODO: write a fuzz test to pack arbitrary arrays
let r
const msg2 = new Uint8Array(12)
let offsetBits = 0



// writing to the same location should overwrite rather than add
/*
r = pack.uint(msg2,         0,  2,            8)
console.log('r:', r, 'msg2:', msg2)

r = pack.uint(msg2,         0,  5,           8)
console.log('r:', r, 'msg2:', msg2)
*/


//                    offsetBits         value
r = pack.float16(msg2,         0,  -70.640094523)
r = pack.float16(msg2,         r,       91.34096)
r = pack.uint8(msg2,          32,            203)

console.log('r:', r, 'msg2:', msg2)

//                    offsetBits  bitsToRead
r = unpack.float16(msg2,       0,     16)
console.log('f16 unpack1:', r)

r = unpack.float16(msg2,      16,    16)
console.log('f16 unpack2:', r)

//                    offsetBits  bitsToRead
r = unpack.uint8(msg2,        32,     8)
console.log('uint8 unpack3:', r)





//                 offsetBits       value   bitsToWrite
r = pack.uint(msg2,         0,        255,            5)
r = pack.uint(msg2,         r,  987654321,           32)
r = pack.uint(msg2,         r,          3,            2)
console.log('r:', r, 'msg2:', msg2)

//                offsetBits  bitsToRead
r = unpack.uint(msg2,       0,          5)
console.log('uint unpack1:', r)

r = unpack.uint(msg2,       5,        32)
console.log('uint unpack2:', r)

r = unpack.uint(msg2,       37,        2)
console.log('uint unpack3:', r)

////////////////////////




pack.uint8(msg, 0, 7)
pack.uint16(msg, 8, 61099)
pack.uint32(msg, 24, 839162143)

const testString = 'you bastard'
pack.str(msg, 56, testString)

console.log('mb:', msg)

console.log('--------\nunpacking:')

console.log(unpack.uint8(msg, 0))
console.log(unpack.uint16(msg, 8))
console.log(unpack.uint32(msg, 24))

const unpackedStr = unpack.str(msg, 56)
console.log('unpacked string:', unpackedStr)
