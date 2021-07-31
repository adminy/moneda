'use strict'

const { Time } = require('./helpers')
const storage = require('./Storage')
const Component = require('./Component')
const blockchain = require('./Blockchain')
const Block = require('./Block')
module.exports = new class BlockProcessor extends Component {
  constructor () {
    super()
    this.module = 'BLP'

    this.broadcast = (hash, data) => require('./Net').broadcastBlockFoundZipped(hash, data)
    this.add = (hash, rawData, module) => {
      let blockId = blockchain.getBlockIdByHash(hash)
      if (!blockId) {
        const block = Block.fromRaw(hash, rawData)
        if (!block.wasUnpacked()) return
        const blockHash = block.getHash()
        const blockData = block.getData()
        blockId = blockchain.getBlockIdByHash(blockHash)
        if (blockId) return // KNOWN
        const prevBlockMeta = blockchain.getBlockMetaByHash(blockData.prevBlock)
        if (prevBlockMeta) {
          const { id } = blockchain.getMasterBranch()
          const branchStructure = blockchain.getBranchStructure(id)
          const [valid, err] = block.isValidInBranchStructure(branchStructure)
          if (!valid) return this.log('{red-fg}Block is NOT valid: ' + err + '{/red-fg}')
          const blockHeight = prevBlockMeta.height + 1
          const collision = blockchain.checkForCollision(prevBlockMeta.branchId, blockHeight)
          let branchId = prevBlockMeta.branchId
          if (collision) {
            this.log('Creating new branch due to collision')
            branchId = blockchain.addBranch(branchId, prevBlockMeta.height + 1)
          }
          storage.session.synchronizer.lastBlockAdded = Time.local()
          blockchain.addBlockToBranch(branchId, blockHeight, block)
          this.logBy(module || this.module, '{green-fg}New block ACCEPTED{/green-fg} and added to branch #' + branchId)
          this.broadcast(hash, rawData)
        } else this.log('{red-fg}New block IGNORED: unknown prevBlock{/red-fg}')
      }
    }
  }
}()
