'use strict'
const eccrypto = require('eccrypto')
const Hash = require('./Hash')
module.exports = {
  make: (data, privateKey) => eccrypto.sign(privateKey, Hash.once(data)),
  verify: (data, publicKey, sign) => eccrypto.verify(publicKey, Hash.once(data), sign)
}
