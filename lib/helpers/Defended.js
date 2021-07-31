'use strict'

const crypto = require('crypto')
const algorithm = 'aes-256-ctr' // started with: aes192, aes-256-ctr, aes-256-cbc
const IV_LENGTH = 16
const KEY_LENGTH = 32
// const key = crypto.randomBytes(KEY_LENGTH)
function encrypt (text, password) {
  const ENCRYPTION_KEY = Buffer.from(crypto.scryptSync(password, 'GfG', KEY_LENGTH), 'hex')
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(algorithm, ENCRYPTION_KEY, iv)
  let encrypted = cipher.update(text)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

function decrypt (text, password) {
  const ENCRYPTION_KEY = Buffer.from(crypto.scryptSync(password, 'GfG', KEY_LENGTH), 'hex')
  const textParts = text.toString().split(':')
  const iv = Buffer.from(textParts.shift(), 'hex')
  const encryptedText = Buffer.from(textParts.join(':'), 'hex')
  const decipher = crypto.createDecipheriv(algorithm, ENCRYPTION_KEY, iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString()
}
module.exports = { encrypt, decrypt }
