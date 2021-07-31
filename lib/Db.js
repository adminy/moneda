'use strict'

const R = require('ramda')
const Database = require('better-sqlite3')

const { Files } = require('./helpers')
const Component = require('./Component')
class Db extends Component {
  constructor (config) {
    super()
    this.module = 'SQL'
    this.bigQueries = {}
    this.basePath = config.basePath
    this.fileName = config.fileName
    this.transactions = 0
    this.dbPath = this.basePath + this.fileName
    this.db = Database(this.dbPath, {})
    this.log('Runned')
  }

  query (sql, ...args) { return this.db.query(sql).run(...args) }
  prepare (text) { return this.db.prepare(text) }
  run (stmt, values) { return stmt.run(...values) }
  each (...args) {
    const withValues = args[1] instanceof Array
    const text = args[0]
    const values = withValues ? args[1] : []
    const itemCallback = withValues ? args[2] : args[1]
    const returnCallback = withValues ? args[3] : args[2]
    const rows = []
    const rowQuery = this.db.prepare(text).bind(...values)
    for (const row of rowQuery.iterate()) {
      itemCallback(row)
      rows.push(row)
    }
    returnCallback(rows)
  }

  getRow (sql, ...args) { return this.db.prepare(sql).get(...args) }
  getAll (sql, ...args) { return this.db.prepare(sql).all(...args) }

  bigQueryStart (text, tail, delimiter) {
    this.bigQueries[text] = { delimiter, tail, queries: [], values: [] }
  }

  bigQueryRun (text) {
    const { delimiter, queries, values } = this.bigQueries[text]
    if (queries.length) {
      const bigText = text + R.join(delimiter, queries)
      const valuesCopy = values.slice()
      queries.length = 0
      values.length = 0
      this.db.prepare(bigText).run(...valuesCopy)
    }
  }

  bigQueryRunAll () {
    for (const bigQuery in this.bigQueries) {
      this.bigQueryRun(this.bigQueries[bigQuery])
    }
  }

  bigQueryPush (text, values) {
    const bigQuery = this.bigQueries[text]
    bigQuery.queries.push(bigQuery.tail)
    bigQuery.values = [...bigQuery.values, ...values]
    bigQuery.queries.length >= 128 && this.bigQueryRun(text)
  }

  bigQueryEnd (text) {
    this.bigQueryRun(text)
    delete this.bigQueries[text]
  }

  saveCheckpoint (path) {
    Files.copy(this.dbPath, path + this.fileName)
  }

  loadCheckpoint (path) {
    Files.copyBack(this.dbPath, path + this.fileName)
    this.db = Database(this.dbPath, {})
  }
}

module.exports = (config) => {
  return new Db(config)
}
