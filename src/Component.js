'use strict'

const moment = require('moment')
const R = require('ramda')
const EventEmitter = require('events')
const storage = require('./Storage')
module.exports = class Component extends EventEmitter {
  constructor () {
    super()
    this.module = 'UNK'
    this.waiters = []
    this.log = (...data) => this.logBy(this.module, ...data)
    this.logBy = (module, ...data) => {
      if (!storage.session.disableLog && (!storage.logIgnoreModules || !storage.logIgnoreModules[module]) && (!storage.logTrackModule || storage.logTrackModule === module)) {
        const dataTimed = ['[' + moment().format('HH:mm:ss') + ' ' + module + ']#', ...data]
        const dataToLog = R.contains(module, ['FND', 'WLT', 'COL']) ? [module, ...dataTimed] : dataTimed
        storage.emit('log', ...dataToLog) || console.log(...dataToLog)
      }
    }
    this.logAlias = (alias, data) => this.logAliasBy(this.module, alias, data)
    this.logAliasBy = (module, alias, data) => !storage.session.disableLog && (storage.emit('logAlias', module, alias, data) || console.log(data))
    this.logAliasClear = (alias) => storage.emit('logAliasClear', this.module, alias)
  }
}
