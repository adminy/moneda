'use strict'

module.exports = new class Buffers {
  // / 2
  shift (buffer) {
    const res = []
    let nextMask = 0x00
    for (const value of buffer) {
      res.push(value >> 1 | nextMask)
      nextMask = value & 0x01 ? 0x80 : 0x00
    }
    return Buffer.from(res)
  }

  // * 2
  unshift (buffer, addOne = false) {
    const res = []
    const prevMask = null
    let prevValue = null
    for (const value of buffer) {
      if (prevValue !== null) {
        res.push(prevValue << 1 | (value & 0x80 ? 0x01 : 0x00))
      }
      prevValue = value
    }
    res.push(prevValue << 1 | (addOne ? 0x01 : 0x00))
    return Buffer.from(res)
  }
}()
