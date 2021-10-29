import Transaction from './Transaction'
import * as config_core from '../config/core.json'
import proofOfWorkHash from './proofOfWorkHash'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
import * as crypto from 'crypto'
import * as config_minify from '../config/minify.json'
import { MerkleTree } from 'merkletreejs'
interface Block {
    nonce: number
    height: number
    timestamp: number
    difficulty: number
    target_difficulty: Buffer
    hash: Buffer
    previousHash: Buffer
    transactions: Array<Transaction>
    merkleRoot: Buffer
    header: Buffer
}
class Block {
    constructor({
        hash = undefined,
        previousHash,
        height,
        timestamp = undefined,
        difficulty = undefined,
        nonce = undefined,
        transactions
    }) {
        if (hash !== undefined) this.hash = hash
        if (previousHash !== undefined) this.previousHash = previousHash
        if (height !== undefined) this.height = height
        if (timestamp !== undefined) this.timestamp = timestamp
        if (difficulty !== undefined) this.difficulty = difficulty
        if (nonce !== undefined) this.nonce = nonce
        if (transactions !== undefined) this.transactions = transactions
    }
    getTransactionHashes() {
        return this.transactions.map(e => Transaction.calculateHash(e))
    }
    setMerkleRoot() {
        const leaves = this.getTransactionHashes()
        const SHA256 = e => crypto.createHash('sha256').update(e).digest()
        const tree = new MerkleTree(leaves, SHA256)
        this.merkleRoot = tree.getRoot()
    }
    setHeader() {
        if (!this.merkleRoot) this.setMerkleRoot()
        let t = this.timestamp.toString(16)
        if (t.length % 2 !== 0) t = '0' + t
        let h = this.height.toString(16)
        if (h.length % 2 !== 0) h = '0' + h
        let d = this.difficulty.toString(16)
        if (d.length % 2 !== 0) d = '0' + d
        this.header = Buffer.concat([
            this.previousHash,
            this.merkleRoot,
            Buffer.from(t, 'hex'),
            Buffer.from(h, 'hex'),
            Buffer.from(d, 'hex')
        ])
    }
    static async calculateHash(block: Block) {
        if (!block.header) block.setHeader()
        let n = block.nonce.toString(16)
        if (n.length % 2 !== 0) n = '0' + n
        return await proofOfWorkHash(Buffer.concat([
            block.header,
            Buffer.from(n, 'hex')
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
    static getReward(height: number) {
        return parseBigInt(config_core.blockReward) >> (BigInt(height) / BigInt(config_core.blockHalving))
    }
    hasValidTransactions() {
        try {
            if (!this.transactions.length) return 0x1n
            const hashes: Array<string> = []
            let amount = Block.getReward(this.height)
            for (let i = 0; i < this.transactions.length; i++) {
                if (i === 0) continue
                const transaction = this.transactions[i]
                if (!transaction) return 0x2n
                const code = transaction.isValid()
                if (code) return code | 0x800000000000n
                if (transaction.timestamp >= this.timestamp) return 0x4n
                amount += parseBigInt(transaction.minerFee)
                hashes.push(Transaction.calculateHash(transaction).toString('hex'))
            }
            const blockReward = parseBigInt(this.transactions[0].amount)
            if (blockReward === null) return 0x8n
            if (blockReward !== amount) return 0x10n
            if (beautifyBigInt(blockReward) !== this.transactions[0].amount) return 0x20n
            if (!(this.transactions[0].to instanceof Buffer)) return 0x40n
            if (Buffer.byteLength(this.transactions[0].to) !== 20) return 0x80n
            if (Object.keys(this.transactions[0]).find(e => [ 'timestamp', 'minerFee', 'from', 'signature', 'recoveryParam' ].includes(e))) return 0x100n
            if (hashes.some((e, i) => hashes.indexOf(e) !== i)) return 0x200n
            return 0x0n
        }
        catch {
            return 0x400n
        }
    }
    static minify(input: Block) {
        const output: object = {}
        for (const property in input) {
            if (config_minify.block[property] !== undefined) {
                if ([ 'hash', 'previousHash' ].includes(property)) output[config_minify.block[property]] = input[property].toString('binary')
                else if (property === 'transactions') output[config_minify.block[property]] = <Array<Transaction>> input[property].map(e => Transaction.minify(e))
                else output[config_minify.block[property]] = input[property]
            }
        }
        return output
    }
    static spawn(input) {
        const output = {}
        for (const property in input) {
            for (const _property in config_minify.block) {
                if (property === config_minify.block[_property]) {
                    if ([ 'hash', 'previousHash' ].includes(_property)) output[_property] = Buffer.from(input[property], 'binary')
                    else if (_property === 'transactions') output[_property] = input[property].map(e => Transaction.spawn(e))
                    else output[_property] = input[property]
                }
            }
        }
        return new Block(<Block> output)
    }
    exceedsMaxBlockSize() {
        if (Buffer.byteLength(
            JSON.stringify(Block.minify(this))
        ) > config_core.maxBlockSize) return true
        return false
    }
    async isValid() {
        try {
            // height
            if (!Number.isSafeInteger(this.height)) return 0x800n
            if (this.height < 0) return 0x1000n
            // nonce
            if (!Number.isSafeInteger(this.nonce)) return 0x2000n
            if (this.nonce < 0) return 0x4000n
            // timestamp
            if (!Number.isSafeInteger(this.timestamp)) return 0x8000n
            if (this.timestamp <= config_core.genesisBlockTimestamp) return 0x10000n
            if (this.timestamp > Date.now()) return 0x20000n
            // difficulty
            if (!Number.isSafeInteger(this.difficulty)) return 0x40000n
            if (this.difficulty < 0) return 0x80000n
            if (this.difficulty > 256 * 2**config_core.smoothness) return 0x100000n
            // hash
            if (!(this.hash instanceof Buffer)) return 0x200000n
            if (Buffer.byteLength(this.hash) !== 32) return 0x400000n
            // previousHash
            if (!(this.previousHash instanceof Buffer)) return 0x800000n
            if (Buffer.byteLength(this.previousHash) !== 32) return 0x1000000n
            // transactions
            if (!Array.isArray(this.transactions)) return 0x2000000n
            // verify
            const code = this.hasValidTransactions()
            if (code) return code | 0x2n
            if (this.exceedsMaxBlockSize()) return 0x4000000n
            if (!this.hash.equals(await Block.calculateHash(this))) return 0x8000000n
            if (!this.meetsDifficulty()) return 0x10000000n
            return 0x0n
        }
        catch {
            return 0x20000000n
        }
    }
}
export default Block