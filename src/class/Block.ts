import * as crypto from 'crypto'
import Transaction from './Transaction'
import schema_block from '../mongoose/schema/block'
import * as config from '../../config.json'
interface Block {
    timestamp: number
    transactions: Array<Transaction>
    previousHash: string
    hash: string
    nonce: number
}
class Block {
    constructor({ timestamp, transactions, previousHash, nonce = 0, hash = null }) {
        this.timestamp = timestamp
        this.previousHash = previousHash
        const _transactions = []
        for (const transaction of transactions) {
            if (transaction instanceof Transaction) _transactions.push(transaction)
            else _transactions.push(new Transaction(transaction))
        }
        this.transactions = _transactions
        this.nonce = nonce
        if (hash !== null) this.hash = hash
        else this.hash = this.calculateHash()
    }
    calculateHash() {
        return crypto.createHash('sha256')
        .update(
            this.previousHash
            + this.timestamp
            + JSON.stringify(this.transactions)
            + this.nonce
        )
        .digest('hex')
    }
    async mineBlock(difficulty) {
        while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join('0')) {
            this.nonce++
            this.hash = this.calculateHash()
        }
        await this.save()
    }
    hasValidTransactions() {
        for (const transaction of this.transactions) {
            if (!transaction.isValid()) return false
        }
        let miningReward = config.miningReward
        this.transactions.map(e => miningReward += e.minerFee)
        if (this.transactions[0].amount !== miningReward) return false
        return true
    }
    async save() {
        await new schema_block({
            hash: this.hash,
            timestamp: this.timestamp,
            transactions: this.transactions,
            previousHash: this.previousHash,
            nonce: this.nonce
        }).save()
    }
}
export default Block