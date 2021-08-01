'use strict'

const crypto = require('crypto')
const once = data => crypto.createHash('sha256').update(data).digest()
module.exports = { once, twice: data => once(once(data)) }
