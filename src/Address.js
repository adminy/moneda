'use strict'

const crypto = require('crypto')
const eccrypto = require('eccrypto')
const bs58 = require('bs58')
const { ADDRESS_GROUP_ID } = require('./Constants')
// const MIN_PRIVATE_KEY = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
// const MAX_PRIVATE_KEY = Buffer.from('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140', 'hex')
// const validatePrivateKey = privateKey => !privateKey.compare(MIN_PRIVATE_KEY)

const publicKeyToAddress = publicKey => {
  const hash = crypto.createHash('ripemd160').update(crypto.createHash('sha256').update(publicKey).digest()).digest()
  const checksum = crypto.createHash('sha256').update(Buffer.concat([ADDRESS_GROUP_ID, hash])).digest().slice(0, 4)
  return Buffer.concat([ADDRESS_GROUP_ID, hash, checksum])
}

const isValid = address => {
  try {
    const decoded = address instanceof Buffer ? address : Buffer.from(bs58.decode(address))
    const basic = decoded.slice(0, 21)
    const checksum = decoded.slice(21)
    const basicChecksum = crypto.createHash('sha256').update(basic).digest().slice(0, 4)
    return checksum.equals(basicChecksum)
  } catch (e) { return false }
}

const address = privateKey => {
  // validate private key or throw
  const publicKey = eccrypto.getPublic(privateKey)
  const addressRaw = publicKeyToAddress(publicKey)
  const address = bs58.encode(addressRaw)
  return {
    getKeys: () => ({ priv: privateKey, publ: publicKey }),
    getRaw: () => addressRaw,
    getHash: () => address
  }
}

module.exports = {
  create: () => address(crypto.randomBytes(32)),
  fromPrivateKey: privateKey => address(privateKey),
  hashToRaw: address => Buffer.from(bs58.decode(address)),
  rawToHash: address => bs58.encode(address),
  publicKeyToAddress,
  isValid
}
