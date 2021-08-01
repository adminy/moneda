'use strict'

const crypto = require('crypto')
module.exports = {
  bool: () => Math.random() < 0.5,
  number: (min, max) => min + Math.floor(Math.random() * (max + 1 - min)),
  item: arr => arr[Math.floor(Math.random() * arr.length)],
  bytes: bytesCount => crypto.randomBytes(bytesCount)
}
