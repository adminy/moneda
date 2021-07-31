'use strict'

const blessed = require('blessed')

module.exports = (screen) => {
  const windows = {
    header: blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      right: 0,
      bottom: screen.height - 1,
      content: '',
      tags: true,
      style: {
        fg: 'white',
        bg: 'cyan'
      }
    }),
    console: blessed.box({
      parent: screen,
      top: 1,
      left: 0,
      right: 0,
      bottom: 1,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black'
      }
    }),
    consoleFixed: blessed.box({
      parent: screen,
      top: screen.height - 1,
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
    blocks: blessed.box({
      parent: screen,
      top: 1,
      left: 0,
      right: 0,
      bottom: 1
    }),
    miner: blessed.box({
      parent: screen,
      top: 1,
      left: 0,
      right: 0,
      bottom: 1,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black'
      }
    }),
    wallet: blessed.box({
      parent: screen,
      top: 1,
      left: 0,
      right: 0,
      bottom: 1,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black'
      }
    }),
    collision: blessed.box({
      parent: screen,
      top: 1,
      left: 0,
      right: 0,
      bottom: 1,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black'
      }
    }),
    footer: blessed.box({
      parent: screen,
      top: screen.height - 1,
      left: 0,
      right: 0,
      bottom: 0,
      content: '{bold}f1/! Console | f2/@ Blocks | f3/£ Miner | f4/$ Wallet |  f5/% Coll | f6/^ Head | f7/& Use wallet | f10/* Quit{/bold}',
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue'
      }
    })
  }

  windows.blocksContent = blessed.box({
    parent: windows.blocks,
    top: 0,
    left: 0,
    right: 0,
    bottom: 1,
    content: '{center}{bold}Block Explorer{/bold}{/center}',
    tags: true,
    style: {
      fg: 'white',
      bg: 'black'
    },
    scrollbar: {
      style: {
        bg: 'cyan'
      },
      track: {
        bg: 'white'
      }
    },
    scrollable: true,
    keys: true
  })
  windows.blocksFooter = blessed.box({
    parent: windows.blocks,
    top: windows.blocks.height - 1,
    left: 0,
    right: 0,
    bottom: 0,
    content: '<- Prev -> Next F8 Jump',
    tags: true,
    style: {
      fg: 'white',
      bg: 'cyan',
      bold: true
    }
  })

  return windows
}
