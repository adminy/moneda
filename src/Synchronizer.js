'use strict'

const { Conv, Probable, Time } = require('./helpers')
const storage = require('./Storage')
const Component = require('./Component')
const blockchain = require('./Blockchain')
const net = require('./Net')

const COUNT_PER_REQUEST = 4096
const { RESPONSE_NO_BLOCK, RESPONSE_NO_BLOCK_AFTER } = net.getConstants()

class Synchronizer extends Component {
  constructor () {
    super()
    this.module = 'SNC'
    this.netInfoBlockchainLengths = {}
    this.db = blockchain.getDb()
    this.initialPrevBlock = blockchain.getInitialPrevBlock()
    this.firstBlockHash = blockchain.getFirstBlockHash()

    storage.session.synchronizer = { promiscuous: true, firstReady: false, ready: false, lastBlockAdded: Time.local(), netInfoBlockchainLength: null }

    // setInterval(() => {
    //   if (storage.session.synchronizer.lastBlockAdded < Time.local() - 120) {
    //     this.log('{yellow-fg}Scheduled synchronization...{/yellow-fg}')
    //     this.sync()
    //   }
    // }, 10000)

    // setTimeout(() => {
    //   Time.doNowAndSetInterval(() => {
    //     net.requestBlockchainLength((err, res) => {
    //       if (!err) {
    //         if (res.blockchainLength >= storage.session.blockchain.length) {
    //           this.netInfoBlockchainLengths[res.address] = res.blockchainLength
    //           storage.session.synchronizer.netInfoBlockchainLength = Probable.calc(Object.values(this.netInfoBlockchainLengths))
    //         }
    //       }
    //     })
    //   }, 30000)
    // }, 5000)

    this.sync = () => {
      // if (this.synchronizing) return this.log('{red-fg}Synchronizer is busy{/red-fg}')
      // this.synchronizing = true
      storage.session.synchronizer.ready = false
      const branches = blockchain.getBranches()
      const prevBlocks = []
      const branchLengths = {}
      for (const branch of branches) {
        prevBlocks.push({ branchId: branch.id, afterHash: branch.lastBlockHash })
        branchLengths[branch.id] = branch.length
      }
      !branches.length && prevBlocks.push({ branchId: 0, afterHash: blockchain.getInitialPrevBlock() }) && this.log('No branches found')
      this.log('Partial synchronization {yellow-fg}STARTED{/yellow-fg} (' + branches.length + ' branch(es))')
      let branchesSynchronized = 0
      let piecesInQueue = -1
      const synchronizeBranch = ({ branchId, afterHash }) => {
        this.log('Synchronizing branch #' + branchId + ' after ' + Conv.bufToHex(afterHash).slice(0, 16) + '...')

        let responses = 0
        let noBlockCount = 0
        let noBlockAfterCount = 0
        let added = 0
        let checked = 0

        net.requestBlocksAfter(afterHash, COUNT_PER_REQUEST, (err, res) => {
          this.log('Sync Responses: ', ++responses)
          if (err) {
            err === RESPONSE_NO_BLOCK && ++noBlockCount && this.log('{yellow-fg}NO_BLOCK{/yellow-fg}')
            err === RESPONSE_NO_BLOCK_AFTER && ++noBlockAfterCount && this.log('{yellow-fg}NO_BLOCK_AFTER{/yellow-fg}')
          } else {
            piecesInQueue++
            for (const block of res) {
              if (!block) return piecesInQueue--
              if (!block.wasUnpacked()) return piecesInQueue--
              const blockHash = block.getHash()
              const blockData = block.getData()
              !(checked++ % 20) && this.logAlias('synchronizing', 'Checking block ' + checked + (piecesInQueue ? '. ' + piecesInQueue + ' piece(s) in queue' : '...'))
              const blockId = blockchain.getBlockIdByHash(blockHash)
              if (!blockId) { // !KNOWN
                let prevBlockMeta = { branchId: 1, height: -1 }
                if (blockData.prevBlock.equals(this.initialPrevBlock)) {
                  if (!blockHash.equals(this.firstBlockHash)) continue
                } else {
                  prevBlockMeta = blockchain.getBlockMetaByHash(blockData.prevBlock)
                  if (!prevBlockMeta) continue
                }
                const branchStructure = blockchain.getBranchStructure(blockchain.getMasterBranch().id)
                const [valid, err] = block.isValidInBranchStructure(branchStructure)
                !valid && this.log('{red-fg}Block is NOT valid: ' + err + '{/red-fg}')
                if (!valid) continue
                const blockHeight = prevBlockMeta.height + 1
                const collision = blockchain.checkForCollision(prevBlockMeta.branchId, blockHeight)
                let branchId = prevBlockMeta.branchId
                if (collision) {
                  this.log('Creating new branch due to collision')
                  branchId = blockchain.addBranch(branchId, prevBlockMeta.height + 1)
                  branchLengths[branchId] = 0
                  storage.session.synchronizer.lastBlockAdded = Time.local()
                  blockchain.addBlockToBranch(branchId, blockHeight, block)
                  branchLengths[branchId]++
                  added++
                }
              }
            }
          }
          this.log('Waiting for blockchain processes...')
          this.logAliasClear('synchronizing')
          this.log('Branch #' + branchId + ' synchronized')
          const removeBranch = () => {
            this.log('Block ' + Conv.bufToHex(afterHash.slice(0, 16)) + ' is isolated')
            const branch = blockchain.getBranchById(branchId)
            branch ? blockchain.removeLastBlockOfBranch(branch) : this.log('Branch #' + branchId + ' has been deleted')
          }
          !added && noBlockAfterCount && branchesSynchronized++
          !added && noBlockCount && removeBranch()
        })
      }
      prevBlocks.forEach(synchronizeBranch)
      this.log('Partial synchronization {green-fg}FINISHED{/green-fg}')
      if (!storage.session.synchronizer.firstReady) {
        storage.session.synchronizer.promiscuous = false
        storage.session.synchronizer.firstReady = true
      }
      storage.session.synchronizer.ready = true
      const isDoneSync = branchesSynchronized === branches.length
      const colour = isDoneSync ? 'green' : 'yellow'
      const emoji = isDoneSync ? '✅' : '⌛'
      this.log(`{${colour}-fg}Synchronized ${branchesSynchronized} / ${branches.length} branch(es) ${emoji} {/${colour}-fg}`)
    }
  }
}

const synchronizer = new Synchronizer()
module.exports = synchronizer
