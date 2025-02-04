'use strict'

/* TODO:
*  setTime() etc. must update rawData directly (without full packing) - just write in buffer
*/

/* Work with tx
*  Tx format
*
*  hash         32 B        Tx hash
*  --------------- HEADER ---------------
*  time          8 B        Time of tx creation
*  txKeyCount    4 B        Count of keys
*  txInCount     4 B        Count of ins
*  txOutCount    4 B        Count of outs
*  --------------- KEYS -----------------
*  Key format
*  publicKey    65 B        Own public key
*  --------------- INS ------------------
*  In format
*  txHash       32 B        Hash of tx with coins
*  outN          4 B        Out id
*  keyId         4 B        Key id
*  signSize      1 B        Size of sign
*  sign   signSize B        Sign of [txHash, outN, OUTS]
*  --------------- OUTS -----------------
*  address      25 B        Address of receiver
*  value         8 B        Amount in micoins
*/

const Component = require('./Component')
const Address = require('./Address')
const blockchain = require('./Blockchain')
const BufferArray = require('./BufferArray')
const ScalableBufferArray = require('./ScalableBufferArray')
const SteppedBuffer = require('./SteppedBuffer')
const { Hash, Sign, Time } = require('./helpers')
const { INITIAL_REWARD, REDUCE_REWARD_EVERY, REDUCE_REWARD_FACTOR, MIN_FEE, MIN_FEE_PER_BYTE } = require('./Constants')

const STEP = 128

module.exports = class Tx extends Component {
  constructor (hash, rawData) {
    super()
    this.data = {
      time: 0,
      txKeyCount: 0,
      txInCount: 0,
      txOutCount: 0,
      txKeys: BufferArray({
        step: 65,
        fields: {
          publicKey: { type: 'buffer', size: 65 }
        }
      }),
      txIns: ScalableBufferArray({
        step: 112,
        fields: {
          txHash: { type: 'buffer', size: 32 },
          outN: { type: 'number', size: 4 },
          keyId: { type: 'number', size: 4 },
          signSize: { type: 'number', size: 1 },
          sign: { type: 'buffer' }
        }
      }),
      txOuts: BufferArray({
        step: 33,
        fields: {
          address: { type: 'buffer', size: 25 },
          value: { type: 'number', size: 8 }
        }
      })
    }
    this.hash = hash
    this.rawData = SteppedBuffer(64)
    this.rawDataReady = !!rawData
    this.errorWhileUnpacking = null

    this.prepareOuts = () => {
      this.txOutsRaw = this.data.txOuts.getWhole()
      this.txOutsRawLength = this.txOutsRaw.length
    }

    this.onDataChanged = () => {
      this.rawDataReady = false
    }

    this.packIfNeeded = () => {
      if (!this.rawDataReady) {
        const { data, rawData } = this
        const { time, txKeyCount, txInCount, txOutCount, txKeys, txIns, txOuts } = data
        if (!txOutCount) {
          throw new Error('Cannot pack tx')
        }

        rawData.seek(32)
        rawData.addUInt(time, 8)
        rawData.addUInt(txKeyCount, 4)
        rawData.addUInt(txInCount, 4)
        rawData.addUInt(txOutCount, 4)
        rawData.addBuffer(txKeys.getWhole())
        /*
        txIns.each((txIn, i, data) => {
          const diff = txIn.signSize - 71
          rawData.addBuffer(diff ? data.slice(0, diff) : data)
        })
        */
        rawData.addBuffer(txIns.getWhole())
        rawData.addBuffer(txOuts.getWhole())

        rawData.seek(0)
        rawData.addBuffer(this.hash || Hash.twice(rawData.getSliced(32)))

        this.rawDataReady = true
      }
    }

    this.unpack = () => {
      const { data, rawData } = this
      if (rawData.getLength() < 52) {
        this.errorWhileUnpacking = 'Missing header'
        return
      }
      rawData.seek(32)
      data.time = rawData.readUInt(8)
      data.txKeyCount = rawData.readUInt(4)
      data.txInCount = rawData.readUInt(4)
      data.txOutCount = rawData.readUInt(4)

      if (rawData.untilEnd() < data.txKeyCount * 65) {
        this.errorWhileUnpacking = 'Missing key'
        return
      }
      data.txKeys.clear()
      for (let i = 0; i < data.txKeyCount; i++) {
        data.txKeys.push({ publicKey: rawData.readBuffer(65) })
      }

      data.txIns.clear()
      for (let i = 0; i < data.txInCount; i++) {
        if (rawData.untilEnd() < 41) {
          this.errorWhileUnpacking = 'Missing IN'
          return
        }
        const txIn = {
          txHash: rawData.readBuffer(32),
          outN: rawData.readUInt(4),
          keyId: rawData.readUInt(4),
          signSize: rawData.readUInt(1)
        }
        txIn.sign = rawData.readBuffer(txIn.signSize)
        if (!txIn.sign) {
          this.errorWhileUnpacking = 'Missing sign'
          return
        }
        data.txIns.push(txIn, { sign: txIn.signSize })
      }

      if (rawData.untilEnd() !== data.txOutCount * 33) {
        this.errorWhileUnpacking = 'Wrong OUTs size'
        return
      }
      data.txOuts.clear()
      for (let i = 0; i < data.txOutCount; i++) {
        data.txOuts.push({
          address: rawData.readBuffer(25),
          value: rawData.readUInt(8)
        })
      }
    }

    if (rawData) {
      this.rawData.addBuffer(hash)
      this.rawData.addBuffer(rawData)
      this.unpack()
    }
  }

  static create () {
    const tx = new Tx()
    return tx
  }

  static fromRaw (hash, rawData) {
    const tx = new Tx(hash, rawData)
    return tx
  }

  static calcFee (txSize) {
    return Math.max(txSize * MIN_FEE_PER_BYTE, MIN_FEE)
  }

  static calcBlockReward (blockHeight) {
    let reward = INITIAL_REWARD
    const steps = parseInt(blockHeight / REDUCE_REWARD_EVERY)
    for (let x = 0; x < steps; x++) {
      reward = parseInt(reward * REDUCE_REWARD_FACTOR)
    }
    return reward
  }

  setTime (time) {
    this.data.time = time
    return true
  }

  addOut (address, value) {
    if (this.data.txIns.getLength()) {
      throw new Error('Cannot add OUT if INs added')
    }

    this.onDataChanged()

    this.data.txOuts.push({ address, value })
    this.data.txOutCount++

    return true
  }

  async addIn (txHash, outN, { priv, publ }) {
    if (!this.data.txOuts.getLength()) throw new Error('Cannot add IN until all OUTs added')
    this.onDataChanged()

    const { txKeys, txIns, txOuts } = this.data
    let keyId = txKeys.indexOf('publicKey', publ)
    if (keyId === -1) {
      txKeys.push({ publicKey: publ })
      keyId = this.data.txKeyCount
      this.data.txKeyCount++
    }

    this.prepareOuts()

    const toSign = Buffer.allocUnsafeSlow(this.txOutsRawLength + 36)
    txHash.copy(toSign)
    toSign.writeUInt32BE(outN, 32)
    this.txOutsRaw.copy(toSign, 36)

    const sign = await Sign.make(toSign, priv)
    txIns.push({ txHash, outN, keyId, signSize: sign.length, sign }, { sign: sign.length })
    this.data.txInCount++
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
    return this.rawData.getSliced(0, 32)
  }

  isValidAsFree () {
    const { id, length } = blockchain.getMasterBranch()
    const branchStructure = blockchain.getBranchStructure(id)
    return this.isValidInBranchStructure(branchStructure, null, length, {})
  }

  async isValidInBranchStructure (branchStructure, blockData, blockHeight, { isFirstBlockTx, notFirstBlockTxsFee }) {
    if (this.errorWhileUnpacking) return [false, this.errorWhileUnpacking]
    // length <= 786432
    if (this.getRawDataLength() > 786432) return [false, 'Too big tx']
    if (isFirstBlockTx) {
      // INs count
      if (this.data.txInCount > 0) return [false, 'First tx has IN']
      // outs count
      if (this.data.txOutCount !== 1) return [false, 'First tx has extra or no OUT']
    }
    // time
    if (this.data.time > Time.global() + 60) return [false, 'Wrong time']
    // hash
    const calcedHash = Hash.twice(this.getRawData())
    if (!calcedHash.equals(this.getHash())) return [false, 'Wrong hash']
    // INs
    let txInSum = 0
    let txOutSum = 0
    for (let i = 0; i < this.data.txIns.length; i++) {
      const txIn = this.data.txIns[i]
      const txWithOut = blockchain.getTxInBranchStructure(txIn.txHash, branchStructure)
      // OUT exists
      if (!txWithOut) return [false, 'Tx with OUT not exists']
      const txWithOutData = txWithOut.getData()
      if (txIn.outN >= txWithOutData.txOuts.getLength()) return [false, 'OUT not exists']
      // prevent double spend in one tx
      if (!this.data.txIns.slice(i + 1).every(txOtherIn => !(txIn.txHash.equals(txOtherIn.txHash) && txIn.outN === txOtherIn.outN))) return [false, 'Double spend in one tx']
      // blockData tx must have no collisions with blockData txs
      // free tx may have collisions with other free txs because every free tx is validating before adding
      // to blockchain
      // miner must create blockData and call isValidAfter() with created blockData
      if (blockData) {
        for (const t in blockData.txList) {
          const otherTx = blockData.txList[t]
          if (this.getHash().equals(otherTx.getHash())) continue
          if (!otherTx.getData().txIns.every(txOtherIn => !(txIn.txHash.equals(txOtherIn.txHash) && txIn.outN === txOtherIn.outN))) return [false, 'Double spend in one blockData']
        }
      }
      const blockId = blockchain.txOutSpentInBranchStructure(txIn.txHash, txIn.outN, branchStructure)
      // OUT not spent
      if (blockId) return [false, 'OUT is spent']
      // public key -> address
      const publicKey = this.data.txKeys.get(txIn.keyId).publicKey
      const addressFromKey = Address.publicKeyToAddress(publicKey)
      const txWithOutDataTxOut = txWithOutData.txOuts.get(txIn.outN)
      if (!addressFromKey.equals(txWithOutDataTxOut.address)) return [false, 'Public key not matches address']
      txInSum += txWithOutDataTxOut.value
      const toSign = SteppedBuffer(64)
      toSign.addBuffer(txIn.txHash)
      toSign.addUInt(txIn.outN, 4)
      toSign.addBuffer(this.data.txOuts.getWhole())
      try {
        await Sign.verify(toSign.getWhole(), publicKey, txIn.sign)
      } catch (e) { return [false, 'Wrong sign of IN'] }
    }

    // OUTs
    const errOut = this.data.txOuts.each((txOut) => {
      // address
      if (!Address.isValid(txOut.address)) return 'Wrong address at OUT'
      // amount
      if (txOut.value <= 0) return 'Wrong amount at OUT'
      txOutSum += txOut.value
    })
    if (errOut) return [false, errOut]
    if (isFirstBlockTx) {
      // reward
      const reward = Tx.calcBlockReward(blockHeight)
      if (txOutSum !== reward + notFirstBlockTxsFee) return [false, 'Wrong amount of reward']
      return [true, null]
    } else {
      // fee
      const fee = txInSum - txOutSum
      if (fee < 0) return [false, 'Wrong fee']
      return [true, null, fee]
    }
  }
}
