'use strict'

/*
*  BLOCK_FOUND_ZIPPED             from 33 bytes
*    buf(32)   hash
*    buf       zlib(data)
*/

const zlib = require('zlib')
const Component = require('../Component')
const storage = require('../Storage')
const blockProcessor = require('../BlockProcessor')
const SteppedBuffer = require('../SteppedBuffer')
const { BLOCK_FOUND_ZIPPED } = require('../Cmd')

module.exports = class BlockFoundZipped extends Component {
  constructor ({ hash, data, raw }) {
    super()
    this.module = 'BFZ'

    this.data = {}
    this.errorWhileUnpacking = false

    this.packet = SteppedBuffer(256)
    if (raw) {
      if (raw.length < 33) {
        this.errorWhileUnpacking = true
        return
      }

      this.packet.addBuffer(raw)
      this.packet.seek(1)
      this.data.hash = this.packet.readBuffer(32)
      zlib.inflateRaw(this.packet.readBufferUntilEnd(), (err, inflated) => {
        if (err) {
          this.log('{red-fg}BLOCK_FOUND_ZIPPED REJECTED: wrong data{/red-fg}')
          this.errorWhileUnpacking = true
          return
        }

        this.packet.seek(33)
        this.packet.addBuffer(inflated)
        this.packet.crop()
      })
    } else {
      this.data.hash = hash

      this.packet.addUInt(BLOCK_FOUND_ZIPPED, 1)
      this.packet.addBuffer(hash)
      this.packet.addBuffer(data)

      this.packet.seek(33)
      zlib.deflateRaw(this.packet.readBufferUntilEnd(), (err, deflated) => {
        if (err) return storage.emit('fatalError', 'zlib error')
        this.packet.seek(33)
        this.packet.addBuffer(deflated)
        this.packet.crop()
      })
    }
  }

  static create (data) { return new BlockFoundZipped(data) }
  static fromRaw (raw) { return new BlockFoundZipped({ raw }) }

  process () {
    if (this.errorWhileUnpacking) return
    blockProcessor.add(this.data.hash, this.packet.getSliced(33))
  }

  getRaw (callback) { callback(this.packet.getWhole()) }
}
