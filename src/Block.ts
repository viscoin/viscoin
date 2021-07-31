import Transaction from './Transaction'
import model_block from './mongoose/model/block'
import * as config_core from '../config/core.json'
import * as config_mongoose from '../config/mongoose.json'
import * as config_settings from '../config/settings.json'
import proofOfWorkHash from './proofOfWorkHash'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
import * as crypto from 'crypto'
interface Block {
    nonce: number
    height: number
    timestamp: number
    difficulty: number
    _difficulty: Buffer
    hash: Buffer
    previousHash: Buffer
    transactions: Array<Transaction>
    header: string
    transactionsHash: string
}
class Block {
    constructor({ transactions, previousHash, height, nonce = undefined, hash = undefined, difficulty = undefined, timestamp = undefined }) {
        if (hash instanceof Buffer) this.hash = hash
        else if (hash !== undefined) this.hash = Buffer.from(hash, 'binary')
        if (previousHash instanceof Buffer) this.previousHash = previousHash
        else if (previousHash !== undefined) this.previousHash = Buffer.from(previousHash, 'binary')
        if (transactions !== undefined) this.transactions = transactions?.map(e => e instanceof Transaction ? e : new Transaction(e))
        if (height !== undefined) this.height = height
        if (nonce !== undefined) this.nonce = nonce
        if (difficulty !== undefined) this.difficulty = difficulty
        if (timestamp !== undefined) this.timestamp = timestamp
    }
    setTransactionsHash() {
        this.transactionsHash = crypto.createHash('sha256').update(JSON.stringify(this.transactions.map(e => Transaction.minify(e)))).digest().toString('binary')
    }
    setHeader() {
        if (this.transactionsHash === undefined) this.setTransactionsHash()
        this.header = crypto.createHash('sha256').update(
            this.previousHash.toString('binary')
            + this.timestamp
            + this.transactionsHash
            + this.height
            + this.difficulty
        ).digest().toString('binary')
    }
    static async calculateHash(block: Block) {
        if (block.header === undefined) block.setHeader()
        return await proofOfWorkHash(block.header + block.nonce)
    }
    static getDifficultyBuffer(difficulty: number) {
        difficulty = difficulty >> config_core.smoothness
        const index = Math.floor(difficulty / 8),
        remainder = difficulty % 8
        return Buffer.alloc(32).fill(Math.pow(2, 7 - remainder), index, index + 1)
    }
    async recalculateHash(add: number) {
        this.nonce += add
        this.hash = await Block.calculateHash(this)
        return this.meetsDifficulty()
    }
    meetsDifficulty() {
        if (this._difficulty === undefined) this._difficulty = Block.getDifficultyBuffer(this.difficulty)
        if (Buffer.compare(this.hash, this._difficulty) !== -1) return false
        return true
    }
    hasValidTransactions() {
        let amount = parseBigInt(config_core.blockReward)
        if (!this.transactions.length) return 1
        const hashes = []
        for (let i = 0; i < this.transactions.length; i++) {
            const transaction: Transaction = this.transactions[i]
            if (typeof transaction !== 'object') return 2
            if (i === 0) continue
            if (transaction.isValid() !== 0) return 3
            const minerFee = parseBigInt(transaction.minerFee)
            if (minerFee === null
            || beautifyBigInt(minerFee) !== transaction.minerFee) return 4
            amount += minerFee
            if (transaction.amount !== undefined) {
                const _amount = parseBigInt(transaction.amount)
                if (_amount === null
                || beautifyBigInt(_amount) !== transaction.amount) return 5
            }
            hashes.push(Transaction.calculateHash(transaction))
        }
        const _amount = parseBigInt(this.transactions[0].amount)
        if (_amount === null
        || _amount !== amount
        || beautifyBigInt(_amount) !== this.transactions[0].amount) return 6
        if (this.transactions[0].to === undefined) return 7
        if (Buffer.byteLength(this.transactions[0].to) !== 20) return 8
        if (this.transactions[0].timestamp !== undefined) return 9
        if (this.transactions[0].minerFee !== undefined) return 10
        if (this.transactions[0].from !== undefined) return 11
        if (this.transactions[0].signature !== undefined) return 12
        if (this.transactions[0].recoveryParam !== undefined) return 13
        if (hashes.some((e, i) => hashes.indexOf(e) !== i)) return 14
        return 0
    }
    static minify(input: Block) {
        if (!input) return null
        const output: object = {}
        for (const property in input) {
            if (config_mongoose.block[property] !== undefined) {
                if (input[property] instanceof Buffer) output[config_mongoose.block[property].name] = input[property].toString('binary')
                else if (property === 'transactions') output[config_mongoose.block[property].name] = <Array<Transaction>> input[property].map(e => Transaction.minify(e))
                else output[config_mongoose.block[property].name] = input[property]
            }
        }
        return output
    }
    static beautify(input: object) {
        if (!input) return null
        const output = {}
        for (const property in input) {
            for (const _property in config_mongoose.block) {
                if (property === config_mongoose.block[_property].name.toString()) {
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
    static async load(query: object | null, projection: string | null = null, options: object | null = null) {
        const block = await model_block
            .findOne(query, projection, options)
            .exec()
        if (!block) return null
        return new Block(Block.beautify(block))
        // const _block = new Block(Block.beautify(block))
        // if (_block.seemsValid() !== 0) return null
        // return _block
    }
    static async loadMany(query: object | null, projection: string | null = null, options: object | null = null) {
        const blocks = await model_block
            .find(query, projection, options)
            .exec()
        return blocks.map(e => new Block(Block.beautify(e)))
    }
    static async exists(query: object) {
        return await model_block.exists(query)
    }
    seemsValid() {
        if (typeof this.nonce !== 'number') return 1
        if (typeof this.height !== 'number') return 2
        if (typeof this.timestamp !== 'number') return 3
        if (typeof this.difficulty !== 'number') return 4
        if (typeof this.hash !== 'object') return 5
        if (typeof this.previousHash !== 'object') return 6
        if (this.hash instanceof Buffer === false) return 7
        if (this.previousHash instanceof Buffer === false) return 8
        if (Array.isArray(this.transactions) === false) return 9
        return 0
    }
    async isValid() {
        const code = this.seemsValid()
        if (code !== 0) return code
        if (this.timestamp > Date.now() + config_settings.maxDesync) return 10
        if (Buffer.byteLength(JSON.stringify(Block.minify(this))) > config_core.maxBlockSize) return 11
        if (this.hash.equals(await Block.calculateHash(this)) === false) return 12
        if (this.meetsDifficulty() === false) return 13
        if (this.hasValidTransactions() !== 0) return 14
        return 0
    }
}
export default Block