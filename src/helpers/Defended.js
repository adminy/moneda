'use strict'

const crypto = require('crypto')
const algorithm = 'aes-256-ctr'
const IV_LENGTH = 16
const KEY_LENGTH = 32
function encrypt (text, password) {
  const key = Buffer.from(crypto.scryptSync(password, 'GfG', KEY_LENGTH), 'hex')
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(algorithm, key, iv)
  let encrypted = cipher.update(text)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

function decrypt (text, password) {
  const key = Buffer.from(crypto.scryptSync(password, 'GfG', KEY_LENGTH), 'hex')
  const textParts = text.toString().split(':')
  const iv = Buffer.from(textParts.shift(), 'hex')
  const encryptedText = Buffer.from(textParts.join(':'), 'hex')
  const decipher = crypto.createDecipheriv(algorithm, key, iv)
  const decrypted = decipher.update(encryptedText)
  return Buffer.from(Buffer.concat([decrypted, decipher.final()]).toString(), 'base64')
}
module.exports = { encrypt, decrypt }
