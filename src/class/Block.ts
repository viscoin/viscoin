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
    height: number
}
class Block {
    constructor({ timestamp, transactions, previousHash, height, nonce = 0, hash = null }) {
        this.timestamp = timestamp
        this.previousHash = previousHash
        this.height = height
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
            + this.height
        )
        .digest('hex')
    }
    hasValidTransactions() {
        let amount = config.mining.reward.amount
        for (const transaction of this.transactions) {
            amount += transaction.minerFee
            if (!transaction.isValid()) return false
        }
        if (this.transactions[0] && this.transactions[0].amount !== amount) return false
        // if (this.transactions[0].amount !== amount) return false
        return true
    }
    async save() {
        await new schema_block({
            hash: this.hash,
            timestamp: this.timestamp,
            transactions: this.transactions,
            previousHash: this.previousHash,
            nonce: this.nonce,
            height: this.height
        }).save()
    }
    recalculateHash(difficulty) {
        this.nonce++
        this.hash = this.calculateHash()
        if (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join('0')) return false
        else return true
    }
}
export default Block