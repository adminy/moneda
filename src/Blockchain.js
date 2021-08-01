'use strict'

/*
Notes:
1. There are may be transactions with the same hashes in one branch of blockchain
*/
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const { Files, Time } = require('./helpers')
const disp = require('./Disp')
const storage = require('./Storage')
const Component = require('./Component')
const Block = require('./Block')
const Tx = require('./Tx')
const ScalableBufferArray = require('./ScalableBufferArray')
const PATH_CHECKPOINTS = path.join(__dirname, '../data/checkpoints/')
const INITIAL_PREV_BLOCK = Buffer.from('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 'hex')
const FIRST_BLOCK_HASH = Buffer.from('00091c70a5766a655134e1a93cee11887515ad34c4f9d4b4287c7994d821cc33', 'hex')

const splitEvery = (list, chunkSize) => [...Array(Math.ceil(list.length / chunkSize))].map(_ => list.splice(0, chunkSize))
module.exports = new class Blockchain extends Component {
  constructor () {
    super()
    this.module = 'BLK'
    this.length = 0
    const dbFileName = 'moneda.db'
    const dbPath = path.join(__dirname, '..', 'data', dbFileName)
    let db = Database(dbPath, {})

    this.dbCreateTables = () => {
      /*
        Notes:
          There may be same transactions in different branch structures
        Table `branches`
          parentId - parent branch
          isMaster - branch is last in master branch structure
          length - height of last block in branch structure + 1
          blockId - id of first block in branch structure
          lastBlockHash - hash of last block in branch structure
        Table `outs`
          inMasterBranch - block with tx with this out belongs to master branch structure
          spentAt - spent at block (id)
        Table `spends`
          txHash, outN - tx data
          spentAt - spent at block (id)
      */
      [
        'CREATE TABLE IF NOT EXISTS branches (id INTEGER PRIMARY KEY, parentId INTEGER, isMaster INTEGER, length INTEGER, blockId INTEGER, lastBlockHash BLOB)',
        'CREATE TABLE IF NOT EXISTS blocks (id INTEGER PRIMARY KEY, branchId INTEGER, height INTEGER, prevBlock BLOB, time INTEGER, hash BLOB, data BLOB)',
        'CREATE TABLE IF NOT EXISTS txs (id INTEGER PRIMARY KEY, blockId INTEGER, hash BLOB)',
        'CREATE TABLE IF NOT EXISTS outs (id INTEGER PRIMARY KEY, blockId INTEGER, blockHeight INTEGER, txHash BLOB, outN INTEGER, address BLOB, amount INTEGER, inMasterBranch INTEGER, spentAt INTEGER)',
        'CREATE TABLE IF NOT EXISTS spends (id INTEGER PRIMARY KEY, txHash BLOB, outN INTEGER, spentAt INTEGER)',

        'CREATE INDEX IF NOT EXISTS branchId ON blocks (branchId)',
        'CREATE INDEX IF NOT EXISTS height ON blocks (height)',
        'CREATE INDEX IF NOT EXISTS time ON blocks (time)',
        'CREATE INDEX IF NOT EXISTS hash ON blocks (hash)',

        'CREATE INDEX IF NOT EXISTS blockId ON txs (blockId)',
        'CREATE INDEX IF NOT EXISTS hash ON txs (hash)',

        'CREATE INDEX IF NOT EXISTS blockId ON outs (blockId)',
        'CREATE INDEX IF NOT EXISTS blockHeight ON outs (blockHeight)',
        'CREATE INDEX IF NOT EXISTS txHash ON outs (txHash)',
        'CREATE INDEX IF NOT EXISTS address ON outs (address)',
        'CREATE INDEX IF NOT EXISTS inMasterBranch ON outs (inMasterBranch)',
        'CREATE INDEX IF NOT EXISTS spentAt ON outs (spentAt)',

        'CREATE INDEX IF NOT EXISTS txHash ON spends (txHash)',
        'CREATE INDEX IF NOT EXISTS spentAt ON spends (spentAt)'
      ].forEach(sql => db.exec(sql))
      const branches = db.prepare('SELECT COUNT(id) cnt FROM branches').all()
      for (const branch of branches) {
        !branch.cnt && db.prepare('INSERT INTO branches (parentId, isMaster, length, lastBlockHash) VALUES (?, ?, ?, ?)').run(0, 1, 0, INITIAL_PREV_BLOCK)
      }
    }

    this.dbClear = () => {
      return new Promise((resolve) => {
        try {
          [
            'DROP TABLE branches',
            'DROP TABLE blocks',
            'DROP TABLE txs',
            'DROP TABLE outs'
          ].forEach(sql => db.exec(sql))
          this.createTables()
            .then(() => resolve())
            .catch((err) => storage.emit('fatalError', err))
        } catch (err) { storage.emit('fatalError', err) }
      })
    }

    this.updateLength = () => {
      const res = db.prepare('SELECT MAX(height) maxHeight FROM blocks').get()
      this.length = res.maxHeight !== null ? res.maxHeight + 1 : 0
      // storage.session.blockchain.length = this.length
    }

    this.logBranches = (...data) => {
      this.log(...data)
      this.logBy('COL', ...data)
    }

    Files.needDir(PATH_CHECKPOINTS)

    this.dbCreateTables()
    this.updateLength()

    storage.session.blockchain = { length: 0 }
    if (!storage.plugins) {
      storage.plugins = {}
    }
    if (!storage.plugins.blockchain) {
      storage.plugins.blockchain = []
    }
    this.freeTxs = ScalableBufferArray({
      step: 65536,
      fields: {
        hash: { type: 'buffer', size: 32 },
        data: { type: 'buffer' },
        added: { type: 'number', size: 8 }
      }
    })

    // this.onFreeTxAdded
    // this.onFreeTxDeleted

    this.switchMasterBranchIfNeeded = () => {
      const branch = db.prepare('SELECT * FROM branches ORDER BY length DESC, id ASC LIMIT 1').get()
      if (branch.isMaster) return
      const masterBranch = db.prepare('SELECT * FROM branches WHERE isMaster=1 LIMIT 1').get()
      db.prepare('UPDATE branches SET isMaster=0 WHERE id=?').run(masterBranch.id)
      db.prepare('UPDATE branches SET isMaster=1 WHERE id=?').run(branch.id)
      const oldBlockIds = []
      const newBlockIds = []
      const fetchBlockIds = (branch, blockIds) => {
        const branchStructure = this.getBranchStructure(branch.id)
        let nextHash = branch.lastBlockHash
        while (nextHash) {
          const blockRow = this.getBlockRowByHash(nextHash)
          const isIn = this.isBlockInBranchStructure(blockRow, branchStructure)
          !isIn && blockIds.push(blockRow.id)
          if (blockRow && blockRow.height) {
            nextHash = blockRow.prevBlock
          } else break
        }
      }
      fetchBlockIds(masterBranch, oldBlockIds)
      fetchBlockIds(branch, newBlockIds)
      const oldBlocksPlaceholders = '?'.repeat(oldBlockIds.length).split('').join(',')
      db.prepare('UPDATE outs SET inMasterBranch=0, spentAt=0 WHERE blockId IN (' + oldBlocksPlaceholders + ')').run(...oldBlockIds)
      db.prepare('UPDATE outs SET spentAt=0 WHERE spentAt IN (' + oldBlocksPlaceholders + ')').run(...oldBlockIds)
      const newBlocksPlaceholders = '?'.repeat(newBlockIds.length).split('').join(',')
      db.prepare('UPDATE outs SET inMasterBranch=1 WHERE blockId IN (' + newBlocksPlaceholders + ')').run(...newBlockIds)
      const spends = db.prepare('SELECT * FROM spends WHERE spentAt IN (' + newBlocksPlaceholders + ')').bind(...newBlockIds)
      for (const { txHash, outN, spentAt } of spends.iterate()) {
        const blockId = this.restoreBlockIdFromTxHashSpentAt(txHash, spentAt)
        db.prepare('UPDATE outs SET spentAt=? WHERE blockId=? AND txHash=? AND outN=?').run(spentAt, blockId, txHash, outN)
      }
      this.logBranches('{yellow-fg}Switched master branch from #' + masterBranch.id + ' to #' + branch.id + '{/yellow-fg}')
    }
    this.removeBranchIfEmpty = branch => {
      const { cnt } = db.prepare('SELECT COUNT(id) cnt FROM blocks WHERE branchId=?').get(branch.id)
      if (!cnt) {
        db.prepare('DELETE FROM branches WHERE id=?').run(branch.id)
        this.logBranches('{yellow-fg}Removed branch #' + branch.id + '{/yellow-fg}')
      } else {
        const neighbor = db.prepare('SELECT * FROM blocks WHERE prevBlock=? AND branchId>? ORDER BY branchId ASC LIMIT 1').get(branch.lastBlockHash, branch.id)
        if (!neighbor) return
        const fromBranchId = neighbor.branchId
        const toBranchId = branch.id
        const branches = db.prepare('SELECT * FROM branches WHERE id=?').bind(fromBranchId)
        for (const fromBranch of branches.iterate()) {
          this.updateBranch(toBranchId, fromBranch.length, fromBranch.lastBlockHash)
          db.prepare('DELETE FROM branches WHERE id=?').run(fromBranchId)
          db.prepare('UPDATE branches SET parentId=? WHERE parentId=?').run(toBranchId, fromBranchId)
          db.prepare('UPDATE blocks SET branchId=? WHERE branchId=?').run(toBranchId, fromBranchId)
          this.logBranches('{yellow-fg}Added branch #' + fromBranchId + ' to branch #' + toBranchId + '{/yellow-fg}')
          if (fromBranch.isMaster) {
            db.prepare('UPDATE branches SET isMaster=? WHERE id=?').run(1, toBranchId)
            this.logBranches('{yellow-fg}Branch #' + toBranchId + ' became master{/yellow-fg}')
          }
        }
      }
    }
    this.addBranch = (parentId, length) => {
      const { lastInsertRowid } = db.prepare('INSERT INTO branches (parentId, isMaster, length) VALUES (?, ?, ?)').run(parentId, 0, length)
      const branchId = lastInsertRowid
      this.logBranches('{yellow-fg}Created new branch #' + branchId + '{/yellow-fg}')
      return branchId
    }
    this.addBlockToBranch = (branchId, height, block) => {
      const blockHash = block.getHash()
      const blockData = block.getData()
      const insertBlock = db.prepare('INSERT INTO blocks (branchId, height, prevBlock, time, hash, data) VALUES (?, ?, ?, ?, ?, ?)').run(branchId, height, blockData.prevBlock, blockData.time, blockHash, block.getRawData())
      const blockId = insertBlock.lastInsertRowid
      const isBranchMaster = !!db.prepare('SELECT id FROM branches WHERE id=? AND isMaster=1').get(branchId)
      const queryUpdateOutsValues = []
      for (const tx of blockData.txList) {
        const txHash = tx.getHash()
        const txData = tx.getData()
        db.prepare('INSERT INTO txs (blockId, hash) VALUES (?, ?)').run(blockId, txHash)
        for (const txIn of txData.txIns) {
          db.prepare('INSERT INTO spends (txHash, outN, spentAt) VALUES (?, ?, ?)').run(txIn.txHash, txIn.outN, blockId)
          isBranchMaster && queryUpdateOutsValues.push(txIn.txHash, txIn.outN)
        }
        for (let outN = 0; outN < txData.txOuts.length; outN++) {
          const { address, value } = txData.txOuts[outN]
          db.prepare('INSERT INTO outs (blockId, blockHeight, txHash, outN, address, amount, inMasterBranch, spentAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(blockId, height, txHash, outN, address, value, isBranchMaster ? 1 : 0, 0)
        }
      }
      if (isBranchMaster && queryUpdateOutsValues.length) {
        const queryUpdateOutsValuesItems = splitEvery(queryUpdateOutsValues, 996)
        for (const queryUpdateOutsValuesItem of queryUpdateOutsValuesItems) {
          const unknowns = 'txHash=? AND outN=? OR '.repeat(queryUpdateOutsValuesItem.length >> 1).slice(0, -4)
          db.prepare('UPDATE outs SET spentAt=? WHERE (' + unknowns + ') AND inMasterBranch=?').run(blockId, ...queryUpdateOutsValuesItem, 1)
        }
      }
      db.prepare('UPDATE branches SET length=length+1, lastBlockHash=? WHERE id=?').run(blockHash, branchId)
      db.prepare('UPDATE branches SET blockId=? WHERE id=? AND blockId IS NULL').run(blockId, branchId)
      this.switchMasterBranchIfNeeded()
      this.updateLength()
    }
    this.updateBranch = (branchId, length, lastBlockHash) => db.prepare('UPDATE branches SET length=?, lastBlockHash=? WHERE id=?').run(length, lastBlockHash, branchId)
    this.removeLastBlockOfBranch = branch => {
      let branchHasBlocks = true
      const blockMeta = this.getBlockMetaByHash(branch.lastBlockHash)
      const lastBlockId = blockMeta.id
      db.prepare('DELETE FROM blocks WHERE id=?').run(lastBlockId)
      db.prepare('DELETE FROM txs WHERE blockId=?').run(lastBlockId)
      db.prepare('DELETE FROM outs WHERE blockId=?').run(lastBlockId)
      db.prepare('UPDATE outs SET spentAt=0 WHERE spentAt=?').run(lastBlockId)
      db.prepare('DELETE FROM spends WHERE spentAt=?').run(lastBlockId)
      branch.length--
      branch.lastBlockHash = blockMeta.prevBlock
      this.updateBranch(branch.id, branch.length, branch.lastBlockHash)
      const removed = this.removeBranchIfEmpty(branch)
      branchHasBlocks = !removed
      this.switchMasterBranchIfNeeded()
      this.updateLength()
      return branchHasBlocks
    }
    this.removeBranch = (branch) => {
      const removeNextBlock = () => this.removeLastBlockOfBranch(branch) && removeNextBlock()
      removeNextBlock()
    }
    this.findOutdatedBranch = () => db.prepare('SELECT * FROM branches WHERE length<?').get(this.length - 10000)
    this.removeOutdatedBranches = () => {
      const removeNextBranch = () => {
        const branch = this.findOutdatedBranch()
        branch && this.removeBranch(branch) && removeNextBranch()
      }
      removeNextBranch()
    }
    this.rowToBlock = row => Block.fromRaw(row.hash, row.data)
    this.eachAfter = (hash, count) => {
      let blockId = 0
      if (!hash.equals(INITIAL_PREV_BLOCK)) {
        blockId = this.getBlockIdByHash(hash)
        if (!blockId) return -1
      }
      return db.prepare('SELECT * FROM blocks WHERE id>? LIMIT ' + count).all(blockId)
    }
    this.eachAfterForced = (hash, count) => {
      let blockId = 0
      if (!hash.equals(INITIAL_PREV_BLOCK)) {
        blockId = this.getBlockIdByHashForced(hash)
        if (!blockId) return -1
      }
      return db.prepare('SELECT * FROM blocks WHERE id>? LIMIT ' + count).all(blockId)
    }
    this.eachInMasterBranchAfter = (hash, count) => {
      const masterBranch = blockchain.getMasterBranch()
      const branchStructure = blockchain.getBranchStructure(masterBranch.id)
      let height = -1
      if (!hash.equals(INITIAL_PREV_BLOCK)) {
        const blockMeta = this.getBlockMetaByHash(hash)
        if (!blockMeta) return -1
        const isIn = this.isBlockInBranchStructure(blockMeta, branchStructure)
        if (!isIn) return -1
        height = blockMeta.height
      }
      let added = 0
      const nextBlock = () => {
        const blockRow = this.getBlockRowInBranchStructureByHeight(branchStructure, ++height)
        if (!blockRow) return added
        ++added !== count && nextBlock()
      }
      nextBlock()
    }
    this.getMasterBranch = () => {
      const rows = db.prepare('SELECT * FROM branches WHERE isMaster=1').all()
      !rows.length && storage.emit('fatalError', 'No master branch')
      return rows
    }
    this.getBranchById = id => db.prepare('SELECT * FROM branches WHERE id=?').get(id)
    this.getBranchCount = () => db.prepare('SELECT COUNT(id) cnt FROM branches').get().cnt
    this.getBranches = () => db.prepare('SELECT * FROM branches').all()
    this.getBranchStructure = branchId => {
      const structure = [branchId]
      let currentBranchId = branchId
      const branchQuery = db.prepare('SELECT parentId FROM branches WHERE id=?')
      const readNext = () => {
        const { parentId } = branchQuery.get(currentBranchId)
        if (parentId) {
          currentBranchId = parentId
          structure.push(parentId)
          readNext()
        }
      }
      readNext()
      return structure
    }
    this.getBranchStructureByBlockId = blockId => {
      const blockMeta = this.getBlockMetaById(blockId)
      return this.getBranchStructure(blockMeta.branchId)
    }
    this.restoreBlockIdFromTxHashSpentAt = (txHash, spentAt) => {
      const branchStructure = this.getBranchStructureByBlockId(spentAt)
      const blockRow = this.findBlockRowWithTxInBranchStructure(txHash, branchStructure)
      return blockRow.id
    }
    this.isBlockInBranchStructure = (blockMeta, branchStructure) => {
      if (blockMeta.branchId === branchStructure[0]) return true
      const branchIndex = branchStructure.indexOf(blockMeta.branchId)
      if (branchIndex === -1) return false
      const childBranchId = branchStructure[branchIndex - 1]
      const childBranch = this.getBranchById(childBranchId)
      const meta = this.getBlockMetaById(childBranch.blockId)
      return blockMeta.height < meta.height
    }
    this.getBlockIdByHash = hash => {
      const block = db.prepare('SELECT id FROM blocks WHERE hash=? LIMIT 1').get(hash)
      return block ? block.id : 0
    }
    this.getBlockIdByHashForced = hash => this.getBlockIdByHash(hash)
    this.getBlockMetaById = id => db.prepare('SELECT id, branchId, height, prevBlock, time, hash FROM blocks WHERE id=?').get(id)
    this.getBlockMetaByHash = hash => {
      const hashes = db.prepare('SELECT id, branchId, height, prevBlock, time, hash FROM blocks WHERE hash=?').all(hash)
      hashes.length > 1 && storage.emit('fatalError', 'Same block hashes in blockchain')
      return hashes[0]
    }
    this.getBlockRowById = id => db.prepare('SELECT * FROM blocks WHERE id=?').get(id)
    this.getBlockRowByHash = hash => {
      const blocks = db.prepare('SELECT * cnt FROM blocks WHERE hash=?').all(hash)
      blocks.length > 1 && storage.emit('fatalError', 'Same block hashes in blockchain')
      return blocks[0]
    }
    this.getBlockByHash = hash => {
      const row = this.getBlockRowByHash(hash)
      return [row ? this.rowToBlock(row) : null, row ? row.height : -1]
    }
    this.getBlockCountByHeight = height => db.prepare('SELECT COUNT(id) cnt FROM blocks WHERE height=?').all(height).map(o => o.cnt)
    this.getBlockRowInBranchStructureByHeight = (branchStructure, height) => {
      const blockRows = db.prepare('SELECT * FROM blocks WHERE height=? AND branchId IN (' + '?'.repeat(branchStructure.length).split('').join(',') + ') ORDER BY branchId DESC').bind(height, ...branchStructure)
      for (const blockRow of blockRows.iterate()) {
        const isIn = this.isBlockInBranchStructure(blockRow, branchStructure)
        if (isIn) return blockRow
      }
    }

    this.getBlockRowInMasterBranchByHeight = height => {
      const masterBranch = this.getMasterBranch()
      const branchStructure = this.getBranchStructure(masterBranch.id)
      const blockRow = this.getBlockRowInBranchStructureByHeight(branchStructure, height)
      return [blockRow, masterBranch]
    }
    // if blockchain contains only one branch
    this.findBlockIdWithTxInSingleBranch = hash => {
      const row = db.prepare('SELECT blockId FROM txs WHERE hash=? LIMIT 1').get(hash)
      return row ? row.blockId : 0
    }
    this.findBlockRowWithTxInBranchStructure = (hash, branchStructure) => {
      // blocks.id ASC because there may be same tx hashes in different blocks
      const blockIdRows = db.prepare('SELECT txs.blockId FROM txs LEFT JOIN blocks ON txs.blockId=blocks.id WHERE txs.hash=? AND blocks.branchId IN (' + '?'.repeat(branchStructure.length).split('').join(',') + ') ORDER BY blocks.branchId DESC, blocks.id ASC').bind(hash, ...branchStructure)
      for (const blockIdRow of blockIdRows.iterate()) {
        const blockRow = this.getBlockRowById(blockIdRow.blockId)
        const isIn = this.isBlockInBranchStructure(blockRow, branchStructure)
        if (isIn) return blockRow
      }
    }
    this.getTxInBranchStructure = (hash, branchStructure) => {
      const blockRow = this.findBlockRowWithTxInBranchStructure(hash, branchStructure)
      if (!blockRow) return
      const block = this.rowToBlock(blockRow)
      const blockData = block.getData()
      for (const i in blockData.txList) {
        const tx = blockData.txList[i]
        if (tx.getHash().equals(hash)) return tx
      }
    }
    this.checkForCollision = (branchId, blockHeight) => !!db.prepare('SELECT COUNT(id) cnt FROM blocks WHERE branchId=? AND height=?').get(branchId, blockHeight).cnt
    this.getLength = () => this.length
    this.getLengthForced = () => this.length
    this.getCountByTimeInBranchStructure = (branchStructure, since, till) => {
      return db.prepare('SELECT id, branchId, height, prevBlock, time, hash FROM blocks WHERE time>=? AND time<=?')
        .all(since, till)
        .map(blockMeta => this.isBlockInBranchStructure(blockMeta, branchStructure) ? 1 : 0)
        .reduce((a, b) => a + b, 0)
    }
    this.txOutSpentInBranchStructure = (hash, outN, branchStructure) => {
      const spendRows = db.prepare('SELECT spentAt FROM spends WHERE txHash=? AND outN=?').bind(hash, outN)
      for (const spentAt of spendRows.iterate()) {
        const blockMeta = this.getBlockMetaById(spentAt)
        const isIn = this.isBlockInBranchStructure(blockMeta, branchStructure)
        if (isIn) return spentAt
      }
      return 0
    }
    this.isTxOutSpentFreeTxs = (hash, out) => {
      // TODO: is it every or some?
      return this.freeTxs.some(({ hash: freeTxHash, data }) => Tx.fromRaw(freeTxHash, data).getData().txIns.some(({ txHash, outN }) => txHash.equals(hash) && outN === out))
    }
    this.deleteOldFreeTxs = () => {
      const minLocalTime = Time.local() - 600
      this.freeTxs.filter(({ hash, added }) => added >= minLocalTime)
    }
    this.isFreeTxKnown = txHash => {
      this.deleteOldFreeTxs()
      return this.freeTxs.indexOf('hash', txHash) >= 0
    }
    this.addFreeTx = tx => {
      this.deleteOldFreeTxs()
      this.freeTxs.push({ hash: tx.getHash(), data: tx.getRawData(), added: Time.local() }, { data: tx.getRawDataLength() })
      this.onFreeTxAdded(tx)
      this.emit('changed')
    }
    this.deleteFreeTx = txHash => {
      const index = this.freeTxs.indexOf('hash', txHash)
      const hasFreeTx = index >= 0
      hasFreeTx && this.freeTxs.remove(index)
      hasFreeTx && this.emit('changed')
      return hasFreeTx
    }
    this.eachFreeTx = () => this.freeTxs.clone()
    this.saveCheckpoint = () => {
      const name = storage.lastCheckpoint && storage.lastCheckpoint === '1' ? '2' : '1'
      const path = PATH_CHECKPOINTS + name + '/'
      fs.rmdirSync(path, { recursive: true })
      fs.mkdirSync(path, { recursive: true })
      Files.copy(dbPath, path + dbFileName)
      fs.openSync(path + 'ready')
      storage.lastCheckpoint = name
      // storage.flush()
      this.log('{green-fg}Checkpoint ' + name + ' saved{/green-fg}')
    }
    this.loadCheckpoint = () => {
      if (!storage.lastCheckpoint) return
      const path = PATH_CHECKPOINTS + storage.lastCheckpoint + '/'
      if (fs.existsSync(path + 'ready')) {
        disp.lockTerm()
        Files.copyBack(dbPath, path + dbFileName)
        db = Database(dbPath, {})
        storage.blockchainCached = true
        // storage.flush()
      }
    }
    this.getDb = () => db
    this.getInitialPrevBlock = () => INITIAL_PREV_BLOCK
    this.getFirstBlockHash = () => FIRST_BLOCK_HASH
  }
}()
