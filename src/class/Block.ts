import * as crypto from 'crypto'
import Transaction from './Transaction'
import schema_block from '../mongoose/schema/block'
import * as config from '../../config.json'
interface Block {
    timestamp: number
    transactions: Array<Transaction>
    previousHash: Buffer
    hash: Buffer
    nonce: number
    height: number
    difficulty: number
    preAllocatedBuffer: Buffer
}
class Block {
    constructor({ timestamp, transactions, previousHash, height, nonce = 0, hash = null, difficulty }) {
        console.log(hash)
        this.timestamp = timestamp
        if (previousHash instanceof Buffer) this.previousHash = previousHash
        else previousHash = Buffer.from(previousHash)
        // this.previousHash = Buffer.from(previousHash)
        this.height = height
        const _transactions = []
        for (const transaction of transactions) {
            if (transaction instanceof Transaction) _transactions.push(transaction)
            else _transactions.push(new Transaction(transaction))
        }
        this.transactions = _transactions
        this.nonce = nonce
        this.difficulty = difficulty
        if (hash) {
            if (hash instanceof Buffer) this.hash = hash
            else this.hash = Buffer.from(hash)
        }
        // if (hash) this.hash = Buffer.from(hash)
        else this.hash = this.calculateHash()
        const index = Math.floor(this.difficulty / 8),
        remainder = this.difficulty % 8
        this.preAllocatedBuffer = Buffer.alloc(32).fill(Math.pow(2, 7 - remainder), index, index + 1)
    }
    calculateHash() {
        return crypto.createHash('sha256')
        .update(
            String(this.previousHash)
            + this.timestamp
            + JSON.stringify(this.transactions)
            + this.nonce
            + this.height
            + this.difficulty
        )
        .digest()
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
            height: this.height,
            difficulty: this.difficulty
        }).save()
    }
    recalculateHash() {
        this.nonce++
        this.hash = this.calculateHash()
        return this.meetsDifficulty()
    }
    meetsDifficulty() {
        if (Buffer.compare(this.hash, this.preAllocatedBuffer) !== -1) return false
        else return true
    }
}
export default Block