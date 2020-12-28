import Transaction from './Transaction'
import model_block from './mongoose/model/block'
import * as config from '../config.json'
import customHash from './customHash'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
interface Block {
    nonce: number
    height: number
    timestamp: number
    difficulty: number
    hash: Buffer
    previousHash: Buffer
    preAllocatedBuffer: Buffer
    transactions: Array<Transaction>
}
class Block {
    constructor({ timestamp = Date.now(), transactions, previousHash, height, nonce = 0, hash = null, difficulty }) {
        this.timestamp = timestamp
        if (previousHash instanceof Buffer) this.previousHash = previousHash
        else if (previousHash) this.previousHash = Buffer.from(previousHash, 'binary')
        this.height = height
        const _transactions = []
        for (const transaction of transactions) {
            if (transaction instanceof Transaction) _transactions.push(transaction)
            else _transactions.push(new Transaction(transaction))
        }
        this.transactions = _transactions
        this.nonce = nonce
        this.difficulty = difficulty
        if (hash instanceof Buffer) this.hash = hash
        else if (hash) this.hash = Buffer.from(hash, 'binary')
        else this.hash = this.calculateHash()
        if (this.difficulty !== undefined) {
            const index = Math.floor(this.difficulty / 8),
            remainder = this.difficulty % 8
            this.preAllocatedBuffer = Buffer.alloc(32).fill(Math.pow(2, 7 - remainder), index, index + 1)
        }
    }
    calculateHash() {
        return customHash(
            this.previousHash.toString('binary')
            + this.timestamp
            + JSON.stringify(this.transactions)
            + this.nonce
            + this.height
            + this.difficulty
        )
    }
    hasValidTransactions() {
        let amount = parseBigInt(config.Block.reward)
        if (!this.transactions.length) return false
        const hashes = []
        for (let i = 0; i < this.transactions.length; i++) {
            const transaction = this.transactions[i]
            if (!transaction) return false
            if (i === 0) continue
            if (!transaction.verify()) return false
            const minerFee = parseBigInt(transaction.minerFee)
            if (minerFee === null
                || beautifyBigInt(minerFee) !== transaction.minerFee) return false
            amount += minerFee
            if (transaction.amount !== undefined) {
                const _amount = parseBigInt(transaction.amount)
                if (_amount === null
                    || beautifyBigInt(_amount) !== transaction.amount) return false
            }
            hashes.push(transaction.calculateHash())
        }
        const _amount = parseBigInt(this.transactions[0].amount)
        if (_amount === null
            || _amount !== amount
            || beautifyBigInt(_amount) !== this.transactions[0].amount) return false
        if (!this.transactions[0].to) return false
        if (Buffer.byteLength(this.transactions[0].to) !== 20) return false
        if (this.transactions[0].timestamp) return false
        if (this.transactions[0].minerFee) return false
        if (this.transactions[0].from) return false
        if (this.transactions[0].data) return false
        if (this.transactions[0].signature) return false
        if (this.transactions[0].recoveryParam) return false
        if (hashes.some((e, i) => hashes.indexOf(e) !== i)) return false
        return true
    }
    static minify(input: Block) {
        const output: object = {}
        for (const property in input) {
            if (config.mongoose.schema.block[property]) {
                if (input[property] instanceof Buffer) output[config.mongoose.schema.block[property].name] = input[property].toString('binary')
                else if (property === 'transactions') output[config.mongoose.schema.block[property].name] = <Array<Transaction>> input[property].map(e => Transaction.minify(e))
                else output[config.mongoose.schema.block[property].name] = input[property]
            }
        }
        return output
    }
    static beautify(input: object) {
        const output = {}
        for (const property in input) {
            for (const _property in config.mongoose.schema.block) {
                if (property === config.mongoose.schema.block[_property].name.toString()) {
                    if (_property === 'transactions') output[_property] = input[property].map(e => Transaction.beautify(e))
                    else output[_property] = input[property]
                }
            }
        }
        return <Block> output
    }
    async save() {
        return await new model_block(Block.minify(this)).save()
    }
    recalculateHash(add: number) {
        this.nonce += add
        this.hash = this.calculateHash()
        return this.meetsDifficulty()
    }
    meetsDifficulty() {
        if (Buffer.compare(this.hash, this.preAllocatedBuffer) !== -1) return false
        else return true
    }
    static async load(query: object | null, projection: string | null = null, options: object | null = null) {
        let block = await model_block
            .findOne(query, projection, options)
            .exec()
        if (!block) return null
        block = Block.beautify(block)
        return new Block(block)
    }
    static async loadMany(query: object | null, projection: string | null = null, options: object | null = null) {
        const blocks = await model_block
            .find(query, projection, options)
            .exec()
        const _blocks = []
        for (const block of blocks) {
            _blocks.push(new Block(Block.beautify(block)))
        }
        return _blocks
    }
    static async exists(query: object) {
        return await model_block.exists(query)
    }
}
export default Block