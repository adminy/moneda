'use strict'
module.exports = {
  objToJson: data => JSON.stringify(data),
  jsonToObj: data => JSON.parse(data),
  strToBase: text => Buffer.from(text).toString('base64'),
  baseToStr: text => Buffer.from(text, 'base64').toString(),
  bufToBase: buffer => buffer.toString('base64'),
  baseToBuf: base => Buffer.from(base, 'base64'),
  bufToHex: buf => buf.toString('hex'),
  hexToBuf: hex => Buffer.from(hex, 'hex'),
  bufToHexBytes: buf => '<Buffer ' + buf.map(Byte => Byte.toString(16).padStart(2, '0') + ' ').join('') + '>',
  countToStr: size => size < 1000 ? size : (size < 1000000 ? (size / 1000 >> 0) + 'K' : (size / 1000000 >> 0) + 'M'),
  sizeToStr: size => size < 1024 ? size + ' B' : (size < 1048576 ? (size / 1024 >> 0) + ' KB' : (size / 1048576 >> 0) + ' MB')
}
