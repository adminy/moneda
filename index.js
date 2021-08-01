'use strict'
const path = require('path')
const moment = require('moment')
const { Conv, Time } = require('./src/helpers')
const storage = require('./src/Storage')
const disp = require('./src/Disp')
const Component = require('./src/Component')
const Address = require('./src/Address')
const blockchain = require('./src/Blockchain')
const ifc = require('./src/Interface')
const p2p = require('./src/P2P')
const synchronizer = require('./src/Synchronizer')
const packageInfo = require('./package')
const minerChief = require('./src/MinerChief')
const dataPath = path.join(__dirname, 'data')
storage.init({ dataPath, config: require('./config.json') })
const app = new class App extends Component {
  constructor () {
    super()
    this.module = 'APP'
    this.webWallet = null
    storage.session.appName = packageInfo.name
    storage.session.version = packageInfo.version
    storage.logIgnoreModules = {
      P2P: storage.logIgnoreModules && storage.logIgnoreModules.P2P !== undefined ? storage.logIgnoreModules.P2P : true,
      P2X: storage.logIgnoreModules && storage.logIgnoreModules.P2X !== undefined ? storage.logIgnoreModules.P2X : true,
      LCK: storage.logIgnoreModules && storage.logIgnoreModules.LCK !== undefined ? storage.logIgnoreModules.LCK : true
    }
    storage.on('fatalError', (error) => {
      this.log('{red-fg}Fatal error: ' + error + '{/red-fg}')
      disp.terminate(() => {
        ifc.close()
        console.log(error)
      })
    })

    ifc.open()
    ifc.key(['C-c', 'f10', '*'], () => {
      ifc.openWindow('loading')
      ifc.updateWindow('loading', { info: 'Terminating...' })
      disp.terminate()
    })
    ifc.openWindow('loading')
    ifc.updateWindow('loading', { info: 'Synchronizing time...' })
    Time.synchronize((timeOffset) => {
      ifc.updateWindow('loading', { info: 'Connecting to nodes...' })
      p2p.online(7438, () => {
        ifc.openWindow('app')

        setInterval(() => storage.flush(), 60000)

        setInterval(() => blockchain.saveCheckpoint(), 600000)
        storage.on('synchronize', () => synchronizer.run())
        blockchain.on('changed', () => minerChief.updateTask())
        require('./src/RpcServer').on('minerRequestedTask', () => ifc.updateWindow('app', { progressMinerState: true }))

        this.walletUI = require('./src/WalletUI')
        require('./src/Debugger')

        let currentBox = 'console'
        let currentBlockHeight = null

        ifc.key(['f1', '!'], () => {
          currentBox = 'console'
          ifc.updateWindow('app', { currentBox })
        })

        ifc.key(['f2', '@'], () => {
          // const waitingClear = ifc.waitingForDispatcher()
          const blockchainLength = blockchain.getLength()
          this.log('blocks: ', blockchainLength)
          if (blockchainLength) {
            currentBox = 'blocks'
            const [blockRow, { id }] = blockchain.getBlockRowInMasterBranchByHeight(blockchainLength - 1)
            currentBlockHeight = blockchainLength - 1
            // waitingClear()
            ifc.updateWindow('app', { currentBox, content: this.compileBlocksTemplate({ blockHeight: currentBlockHeight, block: blockchain.rowToBlock(blockRow), branchId: id }) })
          }
        }, 0, 'App[key F2]')

        ifc.key('left', () => {
          if (ifc.currentBox === 'blocks') {
            // const waitingClear = ifc.waitingForDispatcher()
            currentBlockHeight--
            const [blockRow, { id }] = blockchain.getBlockRowInMasterBranchByHeight(currentBlockHeight)
            // waitingClear()
            blockRow && ifc.updateWindow('app', { currentBox: 'blocks', content: this.compileBlocksTemplate({ blockHeight: currentBlockHeight, block: blockchain.rowToBlock(blockRow), branchId: id }) })
            !blockRow && currentBlockHeight++
          }
        })

        ifc.key('right', () => {
          if (ifc.currentBox === 'blocks') {
            // const waitingClear = ifc.waitingForDispatcher()
            currentBlockHeight++
            const [blockRow, { id }] = blockchain.getBlockRowInMasterBranchByHeight(currentBlockHeight)
            // waitingClear()
            blockRow && ifc.updateWindow('app', { currentBox: 'blocks', content: this.compileBlocksTemplate({ blockHeight: currentBlockHeight, block: blockchain.rowToBlock(blockRow), branchId: id }) })
            !blockRow && currentBlockHeight--
          }
        })

        ifc.key(['f3', '£'], () => ifc.updateWindow('app', { currentBox: 'miner' }))
        ifc.key(['f4', '$'], () => ifc.updateWindow('app', { currentBox: 'wallet' }))
        ifc.key(['f5', '%'], () => ifc.updateWindow('app', { currentBox: 'collision' }))
        ifc.key(['f6', '^'], () => ifc.updateWindow('app', { switchHeaderType: true }))
        ifc.key(['f7', '&'], () => ifc.openWindow(ifc.getCurrentWindow() === 'app' ? 'wallet' : 'app'))
        const askBlock = () => ifc.ask('Block ID', (cancelled, blockId) => {
          const waitingClear = ifc.waitingForDispatcher()
          const [blockRow, { id }] = blockchain.getBlockRowInMasterBranchByHeight(blockId)
          waitingClear()
          if (blockRow) {
            currentBlockHeight = blockId
            ifc.updateWindow('app', { currentBox: 'blocks', content: this.compileBlocksTemplate({ blockHeight: currentBlockHeight, block: blockchain.rowToBlock(blockRow), branchId: id }) })
          }
        })
        ifc.key(['f8', '*'], () => {
          const currentWindow = ifc.getCurrentWindow()
          currentWindow === 'app' && (currentBox === 'blocks' ? askBlock() : this.log('Nodes:', Object.keys(storage.servers || {}).join(', ')))
          currentWindow === 'wallet' && this.walletUI.showMenu('options')
        })
        ifc.key('C-l', () => {
          storage.logIgnoreModules.LCK = !storage.logIgnoreModules.LCK
          storage.flush()
        })

        ifc.key('C-b', () => {
          this.logAlias('deletingextrabranches', '[DEBUG DeleteBranches] Waiting for dispatcher...')
          disp.unsetSigTerm()
          const branches = blockchain.getBranches()
          for (const branch of branches) {
            if (branch.isMaster) continue
            this.logAlias('deletingextrabranches', '[DEBUG DeleteBranches] Deleting extra branch #' + branch.id + '...')
            blockchain.removeBranch(branch)
          }
          this.logAliasClear('deletingextrabranches')
          disp.terminate()
        })

        this.log('Synchronizing blockchain...')
        synchronizer.sync()
        setTimeout(() => minerChief.updateTask(), 1000)
      })
    })
  }

  compileBlocksTemplate ({ blockHeight, block, branchId }) {
    const blockData = block.getData()
    const lines = []

    lines.push('{center}{bold}Block Explorer{/bold}{/center}')
    lines.push('{center}{green-fg}Branch: #' + branchId + ' (master){/green-fg}{/center}')
    lines.push('ID   {bold}' + blockHeight + '{/bold}')
    lines.push('Hash {bold}' + Conv.bufToHex(block.getHash()) + '{/bold}')

    lines.push('Prev {bold}' + Conv.bufToHex(blockData.prevBlock) + '{/bold}')
    lines.push('Time {bold}' + moment(blockData.time * 1000 - moment().utcOffset() * 60000).format('YYYY-MM-DD HH:mm:ss') + '{/bold}')
    lines.push('Diff {bold}' + Conv.bufToHex(blockData.diff) + '{/bold}')
    lines.push('Txs  {bold}' + blockData.txCount + '{/bold}')
    lines.push('')

    for (const tx of blockData.txList) {
      lines.push('{bold}TX ' + Conv.bufToHex(tx.getHash().toString('hex')) + '{/bold}')
      const txData = tx.getData()
      txData.txIns.each(({ txHash, outN }, i) => {
        lines.push('|- IN #' + i + ' ' + Conv.bufToHex(txHash.toString('hex')) + ' #' + outN)
      })
      txData.txOuts.each(({ address, value }, i) => {
        lines.push('|- OUT #' + i + ' ' + Address.rawToHash(address) + ' ' + (value / 100000000) + ' XHD')
      })
      lines.push('')
    }
    return lines.join('\n')
  }
}()
