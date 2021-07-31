'use strict'

const fs = require('fs')
const R = require('ramda')

const { Conv, Defended, Time } = require('./helpers')
const Component = require('./Component')
const Address = require('./Address')
const blockchain = require('./Blockchain')
const txProcessor = require('./TxProcessor')
const BufferArray = require('./BufferArray')
const { MIN_CONFIRMATIONS, MIN_FEE } = require('./Constants')

const BASE_PATH = __dirname + '/../data/'
class Wallet extends Component {
  constructor (password, login = '') {
    super()
    const Tx = require('./Tx')
    this.module = 'WLT'
    this.login = login
    this.password = password
    this.path = Wallet.getPath(this.login)
    this.addresses = []
    this.opened = false
    this.db = blockchain.getDb()

    this.data = {}
    this.flush = () => fs.writeFileSync(this.path, Defended.encrypt(Conv.strToBase(Conv.objToJson(R.map(address => Conv.bufToBase(address.getKeys().priv), this.addresses))), this.password))
    this.create = () => {
      if (this.opened || Wallet.exists(this.login)) return false
      this.opened = true
      this.createAddress()
      return true
    }

    this.open = () => {
      const decrypted = Defended.decrypt(fs.readFileSync(this.path), this.password)
      if (!decrypted) return false
      try {
        this.addresses = JSON.parse(decrypted).map(keyBased => Address.fromPrivateKey(Buffer.from(keyBased, 'base64')))
      } catch (e) { return false }
      this.opened = true
      return true
    }

    this.setPassword = password => {
      this.password = password
      this.flush()
    }

    this.attachAddress = address => {
      if (!this.opened) return
      this.addresses.push(address)
      this.flush()
    }

    this.isOpened = () => this.opened
    this.createAddress = () => {
      if (!this.opened) return
      const address = Address.create()
      this.addresses.push(address)
      this.flush()
    }

    this.getAddresses = () => this.opened && this.addresses
    this.getBalances = () => {
      const balances = {}
      const addressHashes = []
      const addressRaws = []
      R.forEach((address) => {
        const addressHash = address.getHash()
        balances[addressHash] = 0
        addressHashes.push(addressHash)
        addressRaws.push(address.getRaw())
      }, this.addresses)
      const bals = this.db.db.prepare('SELECT address, SUM(amount) amount FROM outs WHERE address IN (' + R.join(',', R.repeat('?', addressRaws.length)) + ') AND inMasterBranch=? AND spentAt=? GROUP BY address').bind(...addressRaws, 1, 0)
      for (const { address, amount } of bals.iterate()) {
        balances[Address.rawToHash(address)] = amount
      }
      return balances
    }

    this.getSoftBalances = () => {
      const blockchainLength = blockchain.getLength()
      const balances = {}
      const addressHashes = []
      const addressRaws = []
      for (const address of this.addresses) {
        const addressHash = address.getHash()
        balances[addressHash] = 0
        addressHashes.push(addressHash)
        addressRaws.push(address.getRaw())
      }
      const bals = this.db.db.prepare('SELECT address, SUM(amount) amount FROM outs WHERE blockHeight>? AND address IN (' + '?'.repeat(addressRaws.length).split('').join(',') + ') AND inMasterBranch=? AND spentAt=? GROUP BY address').bind(blockchainLength - MIN_CONFIRMATIONS, ...addressRaws, 1, 0)
      for (const { address, amount } of bals.iterate()) {
        balances[Address.rawToHash(address)] = amount
      }
      return balances
    }

    this.getFreeBalances = () => {
      const balances = {}
      for (const address of this.addresses) {
        balances[address.getHash()] = 0
      }
      blockchain.eachFreeTx().each(({ hash, data }) => {
        const tx = Tx.fromRaw(hash, data)
        for (const { address, value } of tx.getData().txOuts) {
          for (const addressHash in balances) {
            if (Address.rawToHash(address) === addressHash) {
              balances[addressHash] += value
            }
          }
        }
      })
      return balances
    }

    /*
    recipients - array of {string address, float amount, int amountm}
    senders - array of string address
  */
    this.sendCoins = (recipients, senders = null) => {
      const addressesBalances = []
      const addressesData = {}
      const txIns = BufferArray({
        step: 133,
        fields: {
          txHash: { type: 'buffer', size: 32 },
          outN: { type: 'number', size: 4 },
          priv: { type: 'buffer', size: 32 },
          publ: { type: 'buffer', size: 65 }
        }
      })
      for (const rec of recipients) {
        rec.amount = rec.amount || 0
        rec.amountm = rec.amountm || 0
      }
      // const addresses = recipients.map(rec => rec.address)
      const toReceive = recipients.reduce((total, { amount, amountm }) => total + amount * 100000000 + amountm, 0)
      let toSend = toReceive + MIN_FEE

      for (const address of this.addresses) {
        const addressRaw = address.getRaw()
        const addressHash = address.getHash()
        if (!senders || senders.includes(addressHash)) {
          const res = this.db.db.prepare('SELECT SUM(amount) amount FROM outs WHERE address=? AND inMasterBranch=? AND spentAt=?').get(addressRaw, 1, 0)
          addressesBalances.push({ address: addressHash, balance: res.amount })
          addressesData[addressHash] = address.getKeys()
          addressesData[addressHash].raw = addressRaw
        }
      }
      addressesBalances.sort((a, b) => b.balance - a.balance)
      const blockchainLength = blockchain.getLength()
      const createTx = () => {
        this.log('Creating tx', { toSend, toReceive })
        let rest = toSend
        const tx = Tx.create()
        tx.setTime(Time.global())
        R.forEach(({ address, amount, amountm }) => {
          tx.addOut(Address.hashToRaw(address), amount * 100000000 + amountm)
        }, recipients)
        txIns.clear()

        let finished = false
        for (const { address } of addressesBalances) {
          const senderAddress = address
          const { priv, publ } = addressesData[senderAddress]
          const outs = this.db.db.prepare('SELECT * FROM outs WHERE address=? AND inMasterBranch=? AND spentAt=?').get(addressesData[senderAddress].raw, 1, 0)
          for (const { blockHeight, txHash, outN, amount } of outs.iterate()) {
            if (finished) return
            if (blockchainLength - blockHeight >= MIN_CONFIRMATIONS && !blockchain.isTxOutSpentFreeTxs(txHash, outN)) {
              txIns.push({ txHash, outN, priv, publ })
              rest -= amount
              if (rest <= 0) {
                finished = true
              }
            }
            if (finished) {
              if (rest > 0) return [false, 'Not enough micoins']
              rest < 0 && tx.addOut(addressesData[addressesBalances[0].address].raw, -rest)
              for (const { txHash, outN, priv, publ } of txIns) {
                tx.addIn(txHash, outN, { priv, publ })
              }
              const feeMustBe = Tx.calcFee(tx.getRawDataLength())
              const feeReal = toSend - toReceive
              if (feeReal < feeMustBe) {
                this.log({ feeReal, feeMustBe })
                toSend = toReceive + feeMustBe
                createTx()
              } else return txProcessor.add(tx.getHash(), tx.getRawData(), 'WLT')
            }
          }
        }
      }

      createTx()
    }
  }
}
Wallet.getPath = login => BASE_PATH + 'wallet' + (login === '' ? '' : '-' + login) + '.dat'
Wallet.exists = (login = '') => fs.existsSync(Wallet.getPath(login))
Wallet.use = (password, login) => new Wallet(password, login)
module.exports = Wallet
