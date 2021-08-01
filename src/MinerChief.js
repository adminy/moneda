'use strict'

const { Conv, Time } = require('./helpers')
const storage = require('./Storage')
const Component = require('./Component')
const Address = require('./Address')
const blockchain = require('./Blockchain')
const Block = require('./Block')
const Tx = require('./Tx')
const blockProcessor = require('./BlockProcessor')
const { BLOCK_HEADER_LENGTH } = require('./Constants')
const randomItem = arr => arr[Math.floor(Math.random() * arr.length)]
class MinerChief extends Component {
  constructor () {
    super()
    this.module = 'MNR'
    this.rejectBlocks = false
    this.updatingTask = false
    this.task = {
      active: 0
    }
    storage.session.miner = { task: this.task }

    setInterval(() => {
      if (this.task.active) {
        this.block.setTime(Time.global())
      }
    }, 10000)

    storage.on('rpcMinerBlockFound', (hashData, blockData, txHashList) => {
      if (this.rejectBlocks) {
        return
      }

      const hash = Conv.baseToBuf(hashData)
      const data = Conv.baseToBuf(blockData)

      this.logBy('FND', 'New block found', Conv.bufToHex(hash))

      this.rejectBlocks = true
      this.task.active = 0
      storage.session.miner = { task: { active: 0 } }

      blockProcessor.add(hash, data, 'FND')

      setTimeout(() => {
        this.rejectBlocks = false
        this.block.setTime(Time.global())
        this.task.active = 1
        storage.session.miner.task = this.task
      }, 2000)
    })

    storage.on('rpcBlockConfirmationsCount', (hash, onCount) => {
      const blockMeta = blockchain.getBlockMetaByHash(Conv.hexToBuf(hash))
      if (!blockMeta) return onCount(-1)
      const { length } = blockchain.getBranchById(blockMeta.branchId)
      onCount(length - 1 - blockMeta.height)
    })
  }

  updateTask () {
    if (this.updatingTask || !storage.config.miner || !storage.config.miner.addresses || !storage.config.miner.addresses.length || !storage.session.synchronizer.firstReady) return
    this.updatingTask = true
    this.logAlias('minerupdating', 'Updating miner task...')

    const blockchainLength = blockchain.getLength()
    if (!blockchainLength) return

    const masterBranch = blockchain.getMasterBranch()
    const branchStructure = blockchain.getBranchStructure(masterBranch.id)
    const lastBlock = blockchain.getBlockByHash(masterBranch.lastBlockHash)
    this.block = Block.create()
    const lastBlockData = lastBlock.getData()
    const count = blockchain.getCountByTimeInBranchStructure(branchStructure, lastBlockData.time - 3600, lastBlockData.time)
    const blockDiff = Block.calcDiff(masterBranch.length, lastBlockData.diff, count)
    const blockReward = Tx.calcBlockReward(masterBranch.length)
    const address = randomItem(storage.config.miner.addresses)

    this.block.setPrevBlock(lastBlock.getHash())
    this.block.setTime(Time.global())
    this.block.setDiff(blockDiff)

    let size = BLOCK_HEADER_LENGTH
    let feeSum = 0
    for (const { hash, data } of blockchain.eachFreeTx()) {
      const txSize = data.length + 36
      if (txSize <= 1048576 - size) {
        const tx = Tx.fromRaw(hash, data)
        const [valid, err, fee] = tx.isValidInBranchStructure(branchStructure, this.block.getData(), masterBranch.length, {})
        if (valid) {
          this.block.addTx(tx)
          feeSum += fee
          size += txSize
        } else {
          blockchain.deleteFreeTx(hash)
        }
      }
    }
    const reward = Tx.calcBlockReward(masterBranch.length) + feeSum
    const basicTx = Tx.create()
    basicTx.setTime(Time.global())
    basicTx.addOut(Address.hashToRaw(address), blockReward + feeSum)
    this.block.addFirstTx(basicTx)
    const txHashList = this.block.getData().txHashList.map(({ hash }) => Conv.bufToBase(hash))
    storage.session.stat.txs = txHashList.length
    storage.session.stat.bsz = this.block.getRawDataLength()

    this.task = {
      active: 1,
      blockHeaderSize: this.block.getHeaderLength(),
      blockData: Conv.bufToBase(this.block.getRawData()),
      txHashList,
      reward
    }
    storage.session.miner.task = this.task

    this.updatingTask = false
    this.logAliasClear('minerupdating')
    this.log('Task updated, block reward', reward / 100000000, 'XHD')
  }
}

const minerChief = new MinerChief()
module.exports = minerChief
