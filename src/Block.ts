import Transaction from './Transaction'
import * as config_core from '../config/core.json'
import proofOfWorkHash from './proofOfWorkHash'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
import * as crypto from 'crypto'
import * as config_minify from '../config/minify.json'
interface Block {
    nonce: number
    height: number
    timestamp: number
    difficulty: number
    target_difficulty: Buffer
    hash: Buffer
    previousHash: Buffer
    transactions: Array<Transaction>
    header: Buffer
    transactionsHash: Buffer
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
        this.transactionsHash = crypto.createHash('sha256').update(
            Buffer.concat(
                this.transactions.map(e => Transaction.calculateHash(e))
            )
        ).digest()
    }
    setHeader() {
        if (!this.transactionsHash) this.setTransactionsHash()
        this.header = Buffer.concat([
            this.previousHash,
            this.transactionsHash,
            Buffer.from(this.timestamp.toString(16), 'hex'),
            Buffer.from(this.height.toString(16), 'hex'),
            Buffer.from(this.difficulty.toString(16), 'hex')
        ])
    }
    static async calculateHash(block: Block) {
        if (!block.header) block.setHeader()
        return await proofOfWorkHash(Buffer.concat([
            block.header,
            Buffer.from(block.nonce.toString(16), 'hex')
        ]))
    }
    static getDifficultyBuffer(difficulty: number) {
        difficulty = difficulty >> config_core.smoothness
        const index = Math.floor(difficulty / 8),
        remainder = difficulty % 8
        return Buffer.alloc(32).fill(Math.pow(2, 7 - remainder), index, index + 1)
    }
    async recalculateHash() {
        this.nonce = Math.round(Math.random() * Number.MAX_SAFE_INTEGER)
        this.hash = await Block.calculateHash(this)
        return this.meetsDifficulty()
    }
    meetsDifficulty() {
        if (this.target_difficulty === undefined) this.target_difficulty = Block.getDifficultyBuffer(this.difficulty)
        if (Buffer.compare(this.hash, this.target_difficulty) !== -1) return false
        return true
    }
    hasValidTransactions() {
        let amount = parseBigInt(config_core.blockReward)
        if (!this.transactions.length) return 0x100000000000n
        const hashes = []
        for (let i = 0; i < this.transactions.length; i++) {
            const transaction: Transaction = this.transactions[i]
            if (typeof transaction !== 'object') return 0x200000000000n
            if (i === 0) continue
            if (transaction.timestamp >= this.timestamp) return 0x400000000000n
            const code = transaction.isValid()
            if (code) return code | 0x800000000000n
            const minerFee = parseBigInt(transaction.minerFee)
            if (minerFee === null
            || beautifyBigInt(minerFee) !== transaction.minerFee) return 0x1000000000000n
            amount += minerFee
            if (transaction.amount !== undefined) {
                const _amount = parseBigInt(transaction.amount)
                if (_amount === null
                || beautifyBigInt(_amount) !== transaction.amount) return 0x2000000000000n
            }
            hashes.push(Transaction.calculateHash(transaction))
        }
        const _amount = parseBigInt(this.transactions[0].amount)
        if (_amount === null
        || _amount !== amount
        || beautifyBigInt(_amount) !== this.transactions[0].amount) return 0x4000000000000n
        if (this.transactions[0].to === undefined) return 0x8000000000000n
        if (Buffer.byteLength(this.transactions[0].to) !== 20) return 0x10000000000000n
        if (this.transactions[0].timestamp !== undefined) return 0x20000000000000n
        if (this.transactions[0].minerFee !== undefined) return 0x40000000000000n
        if (this.transactions[0].from !== undefined) return 0x80000000000000n
        if (this.transactions[0].signature !== undefined) return 0x100000000000000n
        if (this.transactions[0].recoveryParam !== undefined) return 0x200000000000000n
        if (hashes.some((e, i) => hashes.indexOf(e) !== i)) return 0x400000000000000n
        return 0x0n
    }
    static minify(input: Block) {
        if (!input) return null
        const output: object = {}
        for (const property in input) {
            if (config_minify.block[property] !== undefined) {
                if (input[property] instanceof Buffer) output[config_minify.block[property]] = input[property].toString('binary')
                else if (property === 'transactions') output[config_minify.block[property]] = <Array<Transaction>> input[property].map(e => Transaction.minify(e))
                else output[config_minify.block[property]] = input[property]
            }
        }
        return output
    }
    static beautify(input) {
        if (!input) return null
        const output = {}
        for (const property in input) {
            for (const _property in config_minify.block) {
                if (property === config_minify.block[_property]) {
                    if (_property === 'transactions') output[_property] = input[property].map(e => Transaction.beautify(e))
                    else output[_property] = input[property]
                }
            }
        }
        return <any> output
    }
    seemsValid() {
        if (typeof this.nonce !== 'number'
            || !Number.isInteger(this.nonce)
            || this.nonce < 0
            || this.nonce > Number.MAX_SAFE_INTEGER) return 0x20000n
        if (typeof this.height !== 'number'
            || !Number.isInteger(this.height)
            || this.height < 0
            || this.height > Number.MAX_SAFE_INTEGER) return 0x40000n
        if (typeof this.timestamp !== 'number'
            || !Number.isInteger(this.timestamp)
            || this.timestamp < 0
            || this.timestamp > Number.MAX_SAFE_INTEGER) return 0x80000n
        if (typeof this.difficulty !== 'number'
            || !Number.isInteger(this.difficulty)
            || this.difficulty < 0
            || this.difficulty > 256 * 2**config_core.smoothness) return 0x100000n
        if (typeof this.hash !== 'object') return 0x200000n
        if (typeof this.previousHash !== 'object') return 0x400000n
        if (this.hash instanceof Buffer === false) return 0x800000n
        if (this.previousHash instanceof Buffer === false) return 0x1000000n
        if (Array.isArray(this.transactions) === false) return 0x2000000n
        const code = this.hasValidTransactions()
        if (code) return code
        return 0x0n
    }
    async isValid() {
        const code = this.seemsValid()
        if (code) return code | 0x4000000n
        if (this.timestamp > Date.now()) return 0x8000000n
        if (Buffer.byteLength(JSON.stringify(Block.minify(this))) > config_core.maxBlockSize) return 0x10000000n
        if (this.hash.equals(await Block.calculateHash(this)) === false) return 0x20000000n
        if (this.meetsDifficulty() === false) return 0x40000000n
        return 0x0n
    }
}
export default Block