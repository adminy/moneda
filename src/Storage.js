'use strict'

const fs = require('fs')
const { Objects } = require('./helpers')
class Storage {
  constructor () {
    this.session = {}
    this.callbacks = {}
    this.defaultCallbacks = {}
  }

  init ({ dataPath, config }) {
    this.initConfig = config
    this.config = config
    this.dataPath = dataPath
    this.path = dataPath + '/storage.json'
    const data = fs.existsSync(this.path) ? JSON.parse(fs.readFileSync(this.path)) : config
    Objects.unbase(data)
    for (const i in data) { this[i] = data[i] }
  }

  flush () {
    const toWrite = {}
    for (const i in this) {
      if (!['path', 'dataPath', 'initConfig', 'session', 'callbacks', 'defaultCallbacks'].includes(i)) {
        toWrite[i] = Objects.clone(this[i])
      }
    }
    Objects.base(toWrite)
    fs.writeFileSync(this.path, JSON.stringify(toWrite))
  }

  reset () {
    const data = JSON.parse(fs.readFileSync(this.initConfig))
    for (const i in data) {
      this[i] = data[i]
    }
  }

  defaultOn (event, callback) {
    this.defaultCallbacks[event] = callback
  }

  defaultOff (event, callback) {
    this.defaultCallbacks[event] = null
  }

  on (event, callback) {
    if (!this.callbacks[event]) { this.callbacks[event] = [] }
    this.callbacks[event].push(callback)
    return [event, this.callbacks[event].length - 1]
  }

  off (listener) {
    this.callbacks[listener[0]][listener[1]] = null
  }

  emit (event, ...data) {
    let responses = 0
    if (this.callbacks[event]) {
      for (const i in this.callbacks[event]) {
        this.callbacks[event][i] && ++responses && this.callbacks[event][i](...data)
      }
    }
    !responses && this.defaultCallbacks[event] && this.defaultCallbacks[event](...data)
    return responses
  }
}

const storage = new Storage()
module.exports = storage
