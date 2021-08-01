'use strict'

const Component = require('./Component')
const blockchain = require('./Blockchain')
const Tx = require('./Tx')
const net = require('./Net')
module.exports = new class TxProcessor extends Component {
  constructor () {
    super()
    this.module = 'TXP'
    this.broadcast = (hash, data) => net.broadcastTxInfo(hash, data)
    this.add = (hash, rawData, module) => {
      if (blockchain.isFreeTxKnown(hash)) return [false, 'Tx is known']
      const tx = Tx.fromRaw(hash, rawData)
      const [valid, err, fee] = tx.isValidAsFree()
      if (valid) {
        const feeMustBe = Tx.calcFee(tx.getRawDataLength())
        if (fee >= feeMustBe) {
          if (!blockchain.isFreeTxKnown(hash)) {
            this.logBy(module || this.module, '{green-fg}Free tx ACCEPTED (' + fee + '/' + feeMustBe + '){/green-fg}')
            blockchain.addFreeTx(tx)
            this.broadcast(hash, rawData)
            return [true, null, fee]
          } else {
            this.logBy(module || this.module, '{red-fg}Free tx REJECTED: Known{/red-fg}')
            return [false, 'Known']
          }
        } else {
          this.logBy(module || this.module, '{yellow-fg}Free tx REJECTED: Too small fee (' + fee + '/' + feeMustBe + '){/yellow-fg}')
          return [false, 'Too small fee', fee]
        }
      } else {
        this.logBy(module || this.module, '{red-fg}Free tx REJECTED: ' + err + '{/red-fg}')
        return [false, err]
      }
    }
  }
}()
