'use strict'

const blessed = require('blessed')
const { Conv } = require('./helpers')
const { app } = require('./windows')
const storage = require('./Storage')
const Component = require('./Component')

const SYM_FILLED = '\u2593'

class Interface extends Component {
  constructor () {
    super()
    this.module = 'IFC'
    this.currentWindow = null
    this.windows = {}
    this.windowsVars = {}
    this.windowsIntervals = {}
    this.popups = {}
    this.states = ['/', '-', '\\', '|']
  }

  sigTerm () {
    if (this.currentWindow === 'app') {
      this.windows.app.console.bottom = 1
      this.windows.app.consoleFixed.top = this.screen.height - 1
      this.screen.render()
    }
  }

  open () {
    this.screen = blessed.screen({ smartCSR: true })
    this.screen.title = storage.session.appName
    storage.on('log', (...data) => {
      const isIn = ['FND', 'WLT', 'COL'].includes(data[0])
      const text = (isIn ? data.slice(1) : data).map(line => typeof line === 'object' ? JSON.stringify(line) : line).join(' ')
      data[0] === 'FND' && this.logMiner(text)
      data[0] === 'WLT' && this.logWallet(text)
      data[0] === 'COL' && this.logCollision(text)
      !isIn && this.logConsole(text)
    })
    storage.on('logAlias', (module, alias, data) => this.logConsoleAlias(module, alias, data))
    storage.on('logAliasClear', (module, alias) => this.logConsoleAliasClear(module, alias))
    return true
  }

  close () { this.screen.destroy() }
  openWindow (name) {
    if (this.currentWindow) {
      this.emit('windowClosed', this.currentWindow)
      this.closeWindow(this.currentWindow)
    }
    this.currentWindow = name
    setImmediate(() => this.emit('windowOpened', this.currentWindow))
    this.clearPopups()

    this.screenWidthHalf = this.screen.width / 2 >> 0
    this.screenHeightHalf = this.screen.height / 2 >> 0

    if (name === 'loading') {
      this.windows.loading = {
        logo: blessed.box({
          parent: this.screen,
          top: this.screenHeightHalf - 10,
          left: this.screenWidthHalf - 100,
          right: this.screenWidthHalf - 100,
          bottom: this.screenHeightHalf - 10,
          content: (
            '            ████████████                              ████████████                                ████████                      ████████\n' +
            '        ████░░░░░░░░░░░░████                        ██░░░░░░░░░░░░██                            ██░░░░░░░░██                    ██░░░░██\n' +
            '      ██░░░░▒▒▒▒▒▒▒▒▒▒▒▒░░░░██                    ██░░▒▒▒▒▒▒▒▒▒▒░░░░██                          ██░░▒▒░░░░██                    ██░░░░██\n' +
            '    ██░░░░▒▒░░░░░░░░░░░░▒▒░░░░██                ██░░▒▒░░░░░░░░░░  ░░░░██                      ██░░▒▒░░  ░░░░██                  ██░░░░██\n' +
            '    ██░░▒▒░░░░      ░░░░░░  ░░██                ██░░▒▒░░    ░░░░  ░░░░██                      ██░░▒▒    ░░░░██                  ██░░░░██\n' +
            '  ██░░▒▒░░░░░░  ░░░░▒▒░░░░░░  ░░██            ██░░▒▒░░░░  ░░▒▒░░░░  ░░░░██                    ██░░▒▒░░  ░░░░██                  ██░░░░██\n' +
            '  ██░░▒▒░░      ░░░░░░  ░░░░  ░░██            ██░░▒▒      ░░░░  ░░  ░░░░██                    ██░░▒▒    ░░░░██                  ██░░░░██\n' +
            '  ██░░▒▒░░  ░░░░░░░░░░░░▒▒░░  ░░██            ██░░▒▒  ░░░░░░░░░░▒▒  ░░▒▒██                    ██░░▒▒░░  ▒▒▒▒██                  ██▒▒▒▒██\n' +
            '  ██░░▒▒░░  ░░░░░░M░░░░░▒▒░░  ░░██            ██░░▒▒  ░░░░░M░░░░▒▒  ░░▒▒██                    ██░░▒▒░░M ▒▒▒▒██                  ██▒▒▒▒██\n' +
            '  ██░░▒▒░░░░▒▒░░░░O░▒▒▒▒▒▒░░  ░░██            ██░░▒▒░░▒▒░░░O▒▒▒▒▒▒  ░░▒▒██                    ██░░▒▒▒▒O ▒▒▒▒██                  ██▒▒▒▒██\n' +
            '  ██░░▒▒░░░░░░  ░░N░▒▒░░░░░░  ░░██            ██░░▒▒░░░░  ░N▒▒░░░░  ░░▒▒██                    ██░░▒▒▒▒N ▒▒▒▒██                  ██▒▒▒▒██\n' +
            '    ██░░▒▒░░░░░░▒▒E▒▒▒░░░░  ░░██                ██░░▒▒░░░░▒E▒▒░░  ░░▒▒██                      ██░░▒▒▒▒E ▒▒▒▒██                  ██▒▒▒▒██\n' +
            '    ██░░░░  ░░░░░░D░░░░░  ░░░░██                ██░░▒▒░░░░░D░░░░  ░░▒▒██                      ██░░░░░D  ▒▒▒▒██                  ██▒▒▒▒██\n' +
            '      ██░░░░      A     ░░░░██                    ██░░     A    ░░▒▒██                          ██░░ A▒▒▒▒██                    ██▒▒▒▒██\n' +
            '        ████░░░░░░░░░░░░████                        ██░░░░░░░░░░▒▒██                            ██░░░░▒▒▒▒██                    ██▒▒▒▒██\n' +
            '            ████████████                              ████████████                                ████████                      ████████'),
          tags: true,
          style: {
            fg: 'green',
            bg: 'blue'
          }
        }),
        progressBar: blessed.box({
          parent: this.screen,
          top: this.screen.height - 2,
          left: 0,
          right: 0,
          bottom: 1,
          content: ' '.repeat(this.screen.width),
          tags: true,
          style: {
            fg: 'cyan',
            bg: 'blue'
          }
        }),
        info: blessed.box({
          parent: this.screen,
          top: this.screen.height - 1,
          left: 0,
          right: 0,
          bottom: 0,
          content: '',
          tags: true,
          style: {
            fg: 'white',
            bg: 'black'
          }
        })
      }

      this.windowsVars.loading = { pos: 0 }

      this.windowsIntervals.loading = {
        progressBar: setInterval(() => {
          const { pos } = this.windowsVars.loading
          let fromStart = this.screen.width - pos - 40
          fromStart = fromStart < 0 ? -fromStart : 0
          const untilEnd = Math.min(40, this.screen.width - pos)
          this.windows.loading.progressBar.setContent('{bold}' + SYM_FILLED.repeat(fromStart) + '{/bold}' + ' '.repeat(pos - fromStart) + '{bold}' + SYM_FILLED.repeat(untilEnd) + '{/bold}' + ' '.repeat(this.screen.width - pos - untilEnd))
          this.screen.render()

          if (pos < this.screen.width) {
            this.windowsVars.loading.pos++
          } else {
            this.windowsVars.loading.pos = 0
          }
        }, 20)
      }
    } else if (name === 'app') {
      if (!this.windows.app) {
        this.windows.app = app(this.screen)
      }

      storage.session.stat = {
        hpsList: {},
        hps: 0,
        txs: 0,
        rps: 0,
        bsz: 0,
        sncColor: 'white'
      }

      if (!this.windowsVars.app) {
        this.windowsVars.app = { headerType: 0, minerState: 0, progressMinerState: false, aliases: {} }
      }

      this.windowsIntervals.app = {
        headerUpdater: setInterval(() => {
          if (this.windowsVars.app.progressMinerState) {
            this.windowsVars.app.progressMinerState = false
            this.windowsVars.app.minerState = (this.windowsVars.app.minerState + 1) % 4
          }
          const blockchainLoaded = storage.session.synchronizer.netInfoBlockchainLength ? (storage.session.blockchain.length * 100 / storage.session.synchronizer.netInfoBlockchainLength).toFixed(1) : 0

          storage.session.stat.sncColor = storage.session.synchronizer ? storage.session.synchronizer.firstReady ? storage.session.synchronizer.ready ? 'white' : 'yellow' : 'red' : 'white'

          if (this.windowsVars.app.headerType === 1) {
            const memoryUsage = process.memoryUsage()
            this.windows.app.header.setLine(0, '{bold}RSS ' + Conv.sizeToStr(memoryUsage.rss).padStart(6) + ' HPT ' + Conv.sizeToStr(memoryUsage.heapTotal).padStart(6) + ' HPU ' + Conv.sizeToStr(memoryUsage.heapUsed).padStart(6) + ' EXT ' + Conv.sizeToStr(memoryUsage.external).padStart(6) + '{/bold}')
          } else {
            storage.emit('getLockQueueLength', (lockQueueLength) => {
              this.windows.app.header.setLine(0, '{bold}HPS ' + storage.session.stat.hps.toString().padStart(4) +
                (storage.session.stat.txs
                  ? ' TXS ' + storage.session.stat.txs.padStart(4)
                  : ' RPS ' + (storage.session.stat.rps >> 1).toString().padStart(6)) +
                (storage.session.stat.bsz
                  ? ' BSZ ' + Conv.sizeToStr(storage.session.stat.bsz).padStart(6)
                  : ''.padStart(9)) +
                ' BLK ' + storage.session.blockchain.length.toString().padStart(8) +
                ' {' + storage.session.stat.sncColor + '-fg}' +
                (blockchainLoaded > 0 && blockchainLoaded < 100 ? '(' + blockchainLoaded + '%)' : 'SNC').padEnd(7) + '{/' + storage.session.stat.sncColor + '-fg} ' +
                storage.session.stat.net.toString().padStart(7) + ' ' +
                'BL ' + lockQueueLength.toString().padStart(3) +
                ' MNR ' + this.states[this.windowsVars.app.minerState] + storage.session.version.toString().padStart(9) + '{/bold}')
              storage.session.stat.rps = 0
            })
          }
          this.screen.render()
        }, 2000)
      }

      this.windows.app.header.setFront()
      this.windows.app.consoleFixed.setFront()
      this.windows.app.console.setFront()
      this.windows.app.footer.setFront()
    } else if (name === 'wallet') {
      this.windows.wallet = {
        header: blessed.box({
          parent: this.screen,
          top: 0,
          left: 0,
          right: 0,
          bottom: this.screen.height - 1,
          content: '{center}{bold}Moneda{/bold}{/center}',
          tags: true,
          style: {
            fg: 'white',
            bg: 'black'
          }
        }),
        addresses: blessed.list({
          parent: this.screen,
          top: 1,
          left: 0,
          right: 0,
          bottom: 1,
          tags: true,
          scrollbar: {
            style: {
              bg: 'cyan'
            },
            track: {
              bg: 'white'
            }
          },
          scrollable: true,
          keys: true,
          style: {
            fg: 'white',
            bg: 'black',
            selected: {
              bold: true,
              bg: 'cyan'
            }
          }
        }),
        consoleFixed: blessed.box({
          parent: this.screen,
          top: this.screen.height - 1,
          left: 0,
          right: 0,
          bottom: 1,
          tags: true,
          style: {
            fg: 'white',
            bg: 'cyan',
            bold: true
          }
        }),
        footer: blessed.box({
          parent: this.screen,
          top: this.screen.height - 1,
          left: 0,
          right: 0,
          bottom: 0,
          content: 'F7 Cnsl F8 Opts',
          tags: true,
          style: {
            fg: 'white',
            bg: 'blue'
          }
        })
      }

      this.windows.wallet.addresses.key('pageup', () => {
        this.windows.wallet.addresses.up(20)
        this.screen.render()
      })

      this.windows.wallet.addresses.key('pagedown', () => {
        this.windows.wallet.addresses.down(20)
        this.screen.render()
      })

      this.windowsVars.wallet = { onAddressSelect: null }
      this.windows.wallet.addresses.setFront()
      this.windows.wallet.addresses.on('select', () => {
        this.windowsVars.wallet.onAddressSelect && this.windowsVars.wallet.onAddressSelect(this.windows.wallet.addresses.selected)
      })
    }
    this.screen.render()
    return true
  }

  updateWindow (name, data) {
    if (name === this.currentWindow) {
      if (name === 'loading') {
        const { info } = data
        if (info) {
          this.windows.loading.info.setContent(info + ' '.repeat(this.screen.width - info.length - 8) + 'F10 Quit')
        }
      } else if (name === 'app') {
        if (data.currentBox) {
          this.clearPopups()
          this.currentBox = data.currentBox
          if (data.currentBox === 'console') {
            this.windows.app.consoleFixed.setFront()
            this.windows.app.console.setFront()
          } else if (data.currentBox === 'blocks') {
            const { content } = data
            this.windows.app.blocksContent.setContent(content)
            this.windows.app.blocks.setFront()
            this.windows.app.blocksContent.focus()
          } else if (data.currentBox === 'miner') {
            this.windows.app.miner.setFront()
          } else if (data.currentBox === 'wallet') {
            this.windows.app.wallet.setFront()
          } else if (data.currentBox === 'collision') {
            this.windows.app.collision.setFront()
          }
        }
        if (data.switchHeaderType) {
          this.windowsVars.app.headerType = this.windowsVars.app.headerType ? 0 : 1
        }
        if (data.progressMinerState) {
          this.windowsVars.app.progressMinerState = true
        }
      } else if (name === 'wallet') {
        const { currentBox, addresses, address, actions, onSelect } = data
        currentBox === 'addresses' && this.windows.wallet.addresses.setFront()
        if (addresses) {
          this.windows.wallet.addresses.setItems(addresses.map(({ address, hard, soft, free }) => address.padEnd(36) + '{green-fg}' + hard.padStart(17) + '{/green-fg}{yellow-fg}' + soft.padStart(17) + '{/yellow-fg}{red-fg}' + free.padStart(8) + '{/red-fg}'))
          this.windows.wallet.addresses.focus()
        }
        this.windowsVars.wallet.onAddressSelect = onSelect && currentBox === 'addresses' ? onSelect : 0
      }
    }
    this.screen.render()
    return true
  }

  closeWindow (name) {
    for (const intervalName in this.windowsIntervals[name]) {
      clearInterval(this.windowsIntervals[name][intervalName])
    }
  }

  ask (question, callback, isPassword = false) {
    this.popups.askBox = blessed.box({
      parent: this.screen,
      top: this.screenHeightHalf - 3,
      left: this.screenWidthHalf - 20,
      right: this.screenWidthHalf - 20,
      bottom: this.screenHeightHalf - 3,
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue'
      }
    })
    this.popups.askInput = blessed.textbox({
      parent: this.popups.askBox,
      top: 2,
      left: 1,
      right: 1,
      height: 1,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black'
      },
      inputOnFocus: true
    })
    const { askBox, askInput } = this.popups
    const onEnter = () => {
      askInput.submit()
    }

    askInput.censor = isPassword
    askBox.setFront()
    askBox.setLine(0, '{center}{bold}' + question + '{/bold}{/center}')
    askBox.setLine(4, '{center}Enter - OK, Escape - cancel{/center}')
    askInput.focus()
    askInput.onceKey('enter', onEnter)
    this.screen.render()

    askInput.once('cancel', () => {
      this.clearPopups()
      callback(true)
    })
    askInput.once('submit', () => {
      this.clearPopups()
      callback(false, askInput.value)
    })
  }

  error (message, callback) {
    this.popups.errorBox = blessed.box({
      parent: this.screen,
      top: this.screenHeightHalf - 3,
      left: this.screenWidthHalf - 20,
      right: this.screenWidthHalf - 20,
      bottom: this.screenHeightHalf - 3,
      tags: true,
      style: {
        fg: 'white',
        bg: 'red'
      }
    })
    const { errorBox } = this.popups

    errorBox.setFront()
    errorBox.setLine(0, '{center}{bold}' + message + '{/bold}{/center}')
    errorBox.setLine(4, '{center}Enter - OK{/center}')
    errorBox.focus()
    errorBox.onceKey('enter', () => {
      this.clearPopups()
      callback && callback()
    })
    this.screen.render()
  }

  notify (message, callback) {
    this.popups.notifyBox = blessed.box({
      parent: this.screen,
      top: this.screenHeightHalf - 3,
      left: this.screenWidthHalf - 20,
      right: this.screenWidthHalf - 20,
      bottom: this.screenHeightHalf - 3,
      tags: true,
      style: {
        fg: 'white',
        bg: 'green'
      }
    })
    const { notifyBox } = this.popups

    notifyBox.setFront()
    notifyBox.setLine(0, '{center}{bold}' + message + '{/bold}{/center}')
    notifyBox.setLine(4, '{center}Enter - OK{/center}')
    notifyBox.focus()
    notifyBox.onceKey('enter', () => {
      this.clearPopups()
      callback && callback()
    })
    this.screen.render()
  }

  updateNotify (message) {
    const { notifyBox } = this.popups
    if (notifyBox) {
      notifyBox.setLine(0, '{center}{bold}' + message + '{/bold}{/center}')
      this.screen.render()
    }
  }

  menu (options, items) {
    const { title } = options
    this.popups.menuBox = blessed.box({
      parent: this.screen,
      top: 1,
      left: 0,
      right: 0,
      bottom: 1,
      tags: true,
      content: '{center}' + title + '{/center}',
      style: {
        bold: true,
        fg: 'white',
        bg: 'black'
      }
    })
    this.popups.menuList = blessed.list({
      parent: this.popups.menuBox,
      top: 1,
      left: 0,
      right: 0,
      bottom: 0,
      tags: true,
      scrollbar: true,
      scrollable: true,
      keys: true,
      items: items.map(({ title }) => title),
      style: {
        fg: 'white',
        bg: 'black',
        selected: {
          bold: true,
          bg: 'cyan'
        },
        scrollbar: {
          bg: 'cyan'
        }
      }
    })
    this.popups.menuBox.setFront()
    this.popups.menuList.focus()
    this.popups.menuList.on('select', () => {
      const { action } = items[this.popups.menuList.selected]
      this.clearPopups()
      action()
    })
    this.screen.render()
  }

  form ({ title, items, onSubmit, onCancel }) {
    this.popups.formBox = blessed.form({
      parent: this.screen,
      top: 1,
      left: 0,
      right: 0,
      bottom: 1,
      tags: true,
      content: '{center}' + title + '\nHint: <Tab> - next field{/center}',
      keys: true,
      style: {
        bold: true
      }
    })
    const focus = {
      bold: true,
      fg: 'white',
      bg: 'cyan'
    }
    const style = {
      bg: 'blue',
      focus
    }
    let top = 0
    for (const i in items) {
      const { title, titleSize, type, censor } = items[i]
      this.popups['formLabel' + i] = blessed.box({
        parent: this.popups.formBox,
        top: top += 2,
        left: 1,
        width: titleSize || 8,
        height: 1,
        content: title
      })
      this.popups['formInput' + i] = blessed[type]({
        parent: this.popups.formBox,
        top,
        left: titleSize ? titleSize + 2 : 10,
        right: 1,
        height: 1,
        style,
        inputOnFocus: true,
        censor: !!censor
      })
      this.popups['formInput' + i].key('enter', () => {
        this.popups['formInput' + i].setValue(this.popups['formInput' + i].value.slice(0, -1))
        this.screen.render()
      })
    }
    this.popups.formSubmit = blessed.button({
      parent: this.popups.formBox,
      top: top += 2,
      left: 1,
      width: 6,
      height: 1,
      keys: true,
      shrink: true,
      name: 'submit',
      content: 'Submit',
      style: {
        fg: 'green',
        focus
      }
    })
    this.popups.formCancel = blessed.button({
      parent: this.popups.formBox,
      top,
      left: 12,
      width: 6,
      height: 1,
      keys: true,
      shrink: true,
      name: 'cancel',
      content: 'Cancel',
      style: {
        fg: 'red',
        focus
      }
    })
    const { formBox, formSubmit, formCancel } = this.popups
    formBox.setFront()
    formBox.focusNext()
    formSubmit.on('press', () => {
      formBox.submit()
    })
    formCancel.on('press', () => {
      formBox.cancel()
    })
    formBox.on('submit', () => {
      const formData = {}
      for (const i in items) {
        const { name, title, type } = items[i]
        formData[name] = this.popups['formInput' + i].value
      }
      this.clearPopups()
      onSubmit && onSubmit(formData)
    })
    formBox.on('cancel', () => {
      this.clearPopups()
      onCancel && onCancel()
    })
    this.screen.render()
  }

  waitingForDispatcher () {
    let waitingState = 0
    const waitingTimeout = setTimeout(() => {
      ifc.notify('Waiting for dispatcher...' + this.states[waitingState])
    }, 500)
    const waitingStateUpdater = setInterval(() => {
      waitingState = (waitingState + 1) % 4
      ifc.updateNotify('Waiting for dispatcher...' + this.states[waitingState])
    }, 500)
    return () => {
      clearTimeout(waitingTimeout)
      clearInterval(waitingStateUpdater)
    }
  }

  clearPopups () {
    for (const name in this.popups) {
      this.popups[name].destroy()
      delete this.popups[name]
    }
  }

  getCurrentWindow () {
    return this.currentWindow
  }

  key (...args) { this.screen.key(...args) }
  logConsole (...data) {
    if (!this.windows.app) return
    for (const line of data) this.windows.app.console.pushLine(line)
    const extraLines = this.windows.app.console.getScreenLines().length - this.screen.height + 2
    for (let i = 0; i < extraLines; i++) this.windows.app.console.shiftLine(0)
    this.screen.render()
  }

  logConsoleAlias (module, alias, data) {
    if (!this.windows.app) return
    const { aliases } = this.windowsVars.app
    if (aliases[alias]) {
      aliases[alias].content = data
      this.windows.app.consoleFixed.setLine(aliases[alias].line, data)
    } else {
      if (Object.values(aliases).reduce((acc, item) => acc + (item.module === module ? 1 : 0), 0) >= 2) return false
      this.windows.app.console.bottom++
      this.windows.app.consoleFixed.top--
      const line = Object.keys(aliases).length
      aliases[alias] = {
        module,
        line: line,
        content: data
      }
      this.windows.app.consoleFixed.setLine(line, data)
    }
    this.screen.render()
  }

  logConsoleAliasClear (module, alias) {
    if (!this.windows.app) return
    const { aliases } = this.windowsVars.app
    if (aliases[alias]) {
      this.windows.app.console.bottom--
      this.windows.app.consoleFixed.top++
      const deletedLine = aliases[alias].line
      delete aliases[alias]
      for (const i in aliases) {
        if (aliases[i].line > deletedLine) {
          aliases[i].line--
          this.windows.app.consoleFixed.setLine(aliases[i].line, aliases[i].content)
        }
      }
      this.screen.render()
    }
  }

  logMiner (...data) {
    if (!this.windows.app) return
    for (const line of data) this.windows.app.miner.pushLine(line)
    const extraLines = this.windows.app.miner.getScreenLines().length - this.screen.height + 2
    for (let i = 0; i < extraLines; i++) this.windows.app.miner.shiftLine(0)
    this.screen.render()
  }

  logWallet (...data) {
    if (!this.windows.app) return
    for (const line of data) this.windows.app.wallet.pushLine(line)
    const extraLines = this.windows.app.wallet.getScreenLines().length - this.screen.height + 2
    for (let i = 0; i < extraLines; i++) this.windows.app.wallet.shiftLine(0)
    this.screen.render()
  }

  logCollision (...data) {
    if (!this.windows.app) return
    for (const line of data) this.windows.app.collision.pushLine(line)
    const extraLines = this.windows.app.collision.getScreenLines().length - this.screen.height + 2
    for (let i = 0; i < extraLines; i++) this.windows.app.collision.shiftLine(0)
    this.screen.render()
  }
}

const ifc = new Interface()
module.exports = ifc
