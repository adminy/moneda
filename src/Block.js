'use strict'

/* Work with blocks
*  Block format
*
*  hash         32 B        Header hash
*  --------------- HEADER ---------------
*  ver           1 B        Block version
*  prevBlock    32 B        Hash of previous block
*  time          8 B        Time of generation (+- 5 sec.)
*  diff         32 B        Maximum value of header hash
*  nonce         8 B        Nonce
*  txCount       4 B        Count of transactions (tx)
*  txHashList 32 * txCount  List of tx hashes
*  --------------------------------------
*  transactions with size (for fast reading) and without hash field
*/

const { Buffers, Hash, Time } = require('./helpers')
const Component = require('./Component')
const storage = require('./Storage')
const BufferArray = require('./BufferArray')
const SteppedBuffer = require('./SteppedBuffer')
const blockchain = require('./Blockchain')
const Tx = require('./Tx')
const { BLOCK_HEADER_LENGTH, BASE_BLOCK_HEADER_LENGTH } = require('./Constants')

const MIN_DIFF = Buffer.from('000000000000000000000000000000000000000000000000000000000000FFFF', 'hex')
const MAX_DIFF = Buffer.from('000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 'hex')

module.exports = class Block extends Component {
  constructor (hash, rawData) {
    super()
    this.data = {
      ver: 2,
      prevBlock: Buffer.allocUnsafeSlow(32),
      time: 0,
      diff: Buffer.allocUnsafeSlow(32),
      nonce: 0,
      txCount: 0,
      txHashList: BufferArray({
        step: 32,
        fields: {
          hash: { type: 'buffer', size: 32 }
        }
      }),
      txList: []
    }
    this.hash = hash
    this.rawData = SteppedBuffer(64)
    this.rawDataReady = !!rawData
    this.hashUpdated = false
    this.errorWhileUnpacking = false

    this.onDataChanged = () => {
      this.rawDataReady = false
    }

    this.packIfNeeded = () => {
      const { data, rawData } = this
      const { ver, prevBlock, time, diff, nonce, txCount, txList } = data

      if (!this.rawDataReady) {
        rawData.seek(32)
        rawData.addUInt(ver, 1)
        rawData.addBuffer(prevBlock)
        rawData.addUInt(time, 8)
        rawData.addBuffer(diff)
        rawData.addUInt(nonce, 8)
        rawData.addUInt(txCount, 4)

        for (const i in txList) {
          rawData.addUInt(txList[i].getRawDataLength(), 4)
          rawData.addBuffer(txList[i].getRawData())
        }

        rawData.seek(0)
        rawData.addBuffer(this.hash || Hash.twice(rawData.getSliced(32, ver === 2 ? BASE_BLOCK_HEADER_LENGTH + txCount * 32 : undefined)))

        this.rawDataReady = true
        this.hashUpdated = true
      }
    }

    this.updateHashIfNeeded = () => {
      if (!this.hashUpdated) {
        this.rawData.seek(0)
        this.rawData.addBuffer(Hash.twice(this.rawData.getSliced(32, this.data.ver === 2 ? BASE_BLOCK_HEADER_LENGTH + this.data.txCount * 32 : undefined)))
      }
    }

    this.unpack = () => {
      const { data, rawData } = this
      if (rawData.getLength() < BASE_BLOCK_HEADER_LENGTH) {
        this.errorWhileUnpacking = true
        return
      }
      rawData.seek(32)
      data.ver = rawData.readUInt(1)
      data.prevBlock = rawData.readBuffer(32)
      data.time = rawData.readUInt(8)
      data.diff = rawData.readBuffer(32)
      data.nonce = rawData.readUInt(8)
      data.txCount = rawData.readUInt(4)
      if (!data.txCount) {
        this.errorWhileUnpacking = true
        return
      }

      if (rawData.untilEnd() < data.txCount * 32) {
        this.errorWhileUnpacking = true
        return
      }
      data.txHashList.clear()
      for (let i = 0; i < data.txCount; i++) {
        data.txHashList.push({ hash: rawData.readBuffer(32) })
      }

      data.txList.length = 0
      for (let i = 0; i < data.txCount; i++) {
        if (rawData.untilEnd() < 4) {
          this.errorWhileUnpacking = true
          return
        }
        const size = rawData.readUInt(4)
        if (!size || rawData.untilEnd() < size) {
          this.errorWhileUnpacking = true
          return
        }
        const txRaw = rawData.readBuffer(size)
        data.txList.push(Tx.fromRaw(data.txHashList.get(i).hash, txRaw))
      }
      if (rawData.untilEnd()) {
        this.errorWhileUnpacking = true
      }
    }

    if (rawData) {
      this.rawData.addBuffer(hash)
      this.rawData.addBuffer(rawData)
      this.unpack()
    }
  }

  static create () {
    return new Block()
  }

  static fromRaw (hash, rawData) {
    const block = new Block(hash, rawData)
    return block
  }

  static calcDiff (blockHeight, prevDiff, blocksCount) {
    if (!(blockHeight % 60)) {
      if ((blocksCount > 70) && (prevDiff.compare(MIN_DIFF) > 0)) {
        return Buffers.shift(prevDiff)
      } else if ((blocksCount < 50) && (prevDiff.compare(MAX_DIFF) < 0)) {
        return Buffers.unshift(prevDiff, true)
      }
    }
    return prevDiff
  }

  setPrevBlock (prevBlock) {
    // this.onDataChanged()
    this.hashUpdated = false
    this.packIfNeeded()

    prevBlock.copy(this.data.prevBlock)
    this.rawData.seek(33)
    this.rawData.addBuffer(prevBlock)
    return true
  }

  setTime (time) {
    // this.onDataChanged()
    this.hashUpdated = false
    this.packIfNeeded()

    this.data.time = time
    this.rawData.seek(65)
    this.rawData.addUInt(time, 8)
    return true
  }

  setDiff (diff) {
    // this.onDataChanged()
    this.hashUpdated = false
    this.packIfNeeded()

    diff.copy(this.data.diff)
    this.rawData.seek(73)
    this.rawData.addBuffer(diff)
    return true
  }

  setNonce (nonce) {
    this.hashUpdated = false
    this.packIfNeeded()

    this.data.nonce = nonce
    this.rawData.seek(105)
    this.rawData.addUInt(nonce, 8)
    return true
  }

  addTx (tx) {
    this.hashUpdated = false
    this.packIfNeeded()

    const hash = tx.getHash()
    this.data.txHashList.push({ hash })
    this.rawData.seek(BASE_BLOCK_HEADER_LENGTH + this.data.txCount * 32)
    this.rawData.reserve(32)
    this.rawData.addBuffer(hash)

    this.data.txCount++
    this.rawData.seek(BASE_BLOCK_HEADER_LENGTH - 4)
    this.rawData.addUInt(this.data.txCount, 4)

    this.data.txList.push(tx)
    this.rawData.tail()
    this.rawData.addUInt(tx.getRawDataLength(), 4)
    this.rawData.addBuffer(tx.getRawData())
    return true
  }

  addFirstTx (tx) {
    this.hashUpdated = false
    this.packIfNeeded()

    const hash = tx.getHash()
    this.data.txHashList.push({ hash }, 0)
    this.rawData.seek(BASE_BLOCK_HEADER_LENGTH)
    this.rawData.reserve(32)
    this.rawData.addBuffer(hash)

    this.data.txCount++
    this.rawData.seek(BASE_BLOCK_HEADER_LENGTH - 4)
    this.rawData.addUInt(this.data.txCount, 4)

    this.data.txList.push(tx)
    this.rawData.seek(BASE_BLOCK_HEADER_LENGTH + this.data.txCount * 32)
    this.rawData.reserve(tx.getRawDataLength() + 4)
    this.rawData.addUInt(tx.getRawDataLength(), 4)
    this.rawData.addBuffer(tx.getRawData())
    return true
  }

  getRawDataLength () {
    this.packIfNeeded()
    return this.rawData.getLength() - 32
  }

  getData () {
    return this.data
  }

  getRawData () {
    this.packIfNeeded()
    return this.rawData.getSliced(32)
  }

  getHash () {
    this.packIfNeeded()
    this.updateHashIfNeeded()
    return this.rawData.getSliced(0, 32)
  }

  getHeader () {
    this.packIfNeeded()
    return this.rawData.getSliced(32, BASE_BLOCK_HEADER_LENGTH + this.data.txCount * 32)
  }

  getHeaderLength () {
    this.packIfNeeded()
    return BLOCK_HEADER_LENGTH + this.data.txCount * 32
  }

  isEasyHash () {
    this.packIfNeeded()
    this.updateHashIfNeeded()
    return this.getHash().compare(this.data.diff) > 0
  }

  wasUnpacked () {
    return !this.errorWhileUnpacking
  }

  // blockchain must be locked before calling isValidInBranchStructure()
  isValidInBranchStructure (branchStructure) {
    if (this.errorWhileUnpacking) return [false, 'Wrong data']
    // length <= 1048576
    if (this.getRawDataLength() > 1048576) return [false, 'Too big block']
    // ver === 1 or ver === 2
    if ((this.data.ver !== 1) && (this.data.ver !== 2)) return [false, 'Wrong version']
    // hash
    const calcedHash = Hash.twice(this.data.ver === 1 ? this.getRawData() : this.getRawData().slice(0, BLOCK_HEADER_LENGTH + 32 * this.data.txCount))
    if (!calcedHash.equals(this.getHash())) return [false, 'Wrong hash']
    // block can be null if blockchain is empty
    const [lastBlock, lastBlockHeight] = blockchain.getBlockByHash(this.data.prevBlock)
    const prevBlockShouldBe = lastBlock ? lastBlock.getHash() : blockchain.getInitialPrevBlock()
    if (!this.data.prevBlock.equals(prevBlockShouldBe)) return [false, 'Wrong prevBlock']
    const lastBlockData = lastBlock ? lastBlock.getData() : null
    if (lastBlock && (this.data.time < lastBlockData.time - 60 || this.data.time > Time.global() + 60)) return [false, 'Wrong time']
    // hash <= diff
    if (this.getHash().compare(this.data.diff) > 0) return [false, 'Too easy hash']
    if (storage.session.synchronizer.promiscuous) return [true]
    // diff
    if (lastBlock && !this.data.diff.equals(Block.calcDiff(lastBlockHeight + 1, lastBlockData.diff, count)) ||
          !lastBlock && !this.data.diff.equals(MAX_DIFF)) return [false, 'Wrong diff']
    let notFirstBlockTxsFee = 0
    for (let i = 1; i < this.data.txCount; i++) {
      const [valid, err, fee] = this.data.txList[i].isValidInBranchStructure(branchStructure, this.data, lastBlockHeight + 1, { isFirstBlockTx: false })
      if (!valid) return [false, 'Wrong tx: ' + err]
      notFirstBlockTxsFee += fee
    }
    const [valid, err] = this.data.txList[0].isValidInBranchStructure(branchStructure, this.data, lastBlockHeight + 1, { isFirstBlockTx: true, notFirstBlockTxsFee })
    return valid ? [true] : [false, 'Wrong tx: ' + err]
    // if (lastBlockData) {
    //   const count = blockchain.getCountByTimeInBranchStructure(branchStructure, lastBlockData.time - 3600, lastBlockData.time)
  }
}
