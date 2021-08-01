'use strict'

const fs = require('fs')
const path = require('path')
const storage = require('./Storage')

const debuggerLogFile = path.join(__dirname, '..', 'data', 'debugger.log')
const tab = '  '

class Debugger {
  constructor () {
    fs.closeSync(fs.openSync(debuggerLogFile, 'w'))
    storage.on('log', (...data) => {
      this.logString(...data)
      // const memoryUsage = process.memoryUsage()
      // this.logString('RSS ' + memoryUsage.rss + ' HPT ' + memoryUsage.heapTotal + ' HPU ' + memoryUsage.heapUsed + ' EXT ' + memoryUsage.external)
    })
  }

  log (data) {
    let dataToWrite = ''
    let level = 0

    const toStr = (d) => {
      level++
      if (typeof d === 'object') {
        if (d instanceof Buffer) {
          dataToWrite += '(buffer)' + d.toString('hex') + '\n'
        } else {
          const isArray = d instanceof Array
          dataToWrite += (isArray ? '[\n' : '{\n')
          for (const i in d) {
            dataToWrite += tab.repeat(level) + '"' + i + '": '
            toStr(d[i])
          }
          dataToWrite += tab.repeat(level - 1) + (isArray ? ']' : '}') + '\n'
        }
      } else {
        dataToWrite += '(' + typeof d + ')' + d + '\n'
      }
      level--
    }

    toStr(data)
    fs.appendFileSync(debuggerLogFile, dataToWrite)
  }

  logString (...data) {
    fs.appendFileSync(debuggerLogFile, data.join(' ').replace(/\{[\/\w]*-fg\}/g, '') + '\n')
  }
}

storage.session.dbg = new Debugger()
