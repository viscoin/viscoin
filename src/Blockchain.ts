import * as config_settings from '../config/settings.json'
import * as config_core from '../config/core.json'
import Transaction from './Transaction'
import Block from './Block'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
import * as events from 'events'
import log from './log'
import * as config_minify from '../config/minify.json'
interface Blockchain {
    blocksDB: any
    hashesDB: any
    pendingTransactions: Array<Transaction>
    hashes: Array<Buffer>
    updatingBlockHashes: boolean
    latestBlock: Block
    minByteFee: {
        bigint: bigint,
        remainder: bigint
    }
    genesisBlockTimestamp: number
    loaded: boolean
    genesisBlock: Block
    addresses: Map<string, bigint>
}
class Blockchain extends events.EventEmitter {
    constructor({ blocks, hashes }) {
        super()
        this.blocksDB = blocks
        this.hashesDB = hashes
        this.pendingTransactions = []
        this.updatingBlockHashes = false
        this.minByteFee = {
            bigint: parseBigInt(config_settings.minByteFee.bigint),
            remainder: parseBigInt(config_settings.minByteFee.remainder)
        }
        this.genesisBlockTimestamp = config_core.genesisBlockTimestamp === -1 ? Date.now() : config_core.genesisBlockTimestamp
        this.loaded = false
        this.hashes = []
        this.addresses = new Map()
        this.setGenesisBlock()
    }
    async setGenesisBlock() {
        this.genesisBlock = await this.createGenesisBlock()
        log.debug(2, 'Created genesisBlock', this.genesisBlock.hash)
        log.info('Loading blockchain...')
        await this.loadBlockHashes(this.genesisBlock.hash)
        this.loaded = true
        log.info(`Done in ${((performance.now()) / 1000).toFixed(3)}s!`)
        log.info(`Blockchain height: ${(await this.getLatestBlock()).height}`)
        this.emit('loaded')
    }
    static difficultyToWork(difficulty: number) {
        return 2n ** BigInt(difficulty >> config_core.smoothness)
    }
    async getWorkSumHashes(hashes: Array<Buffer>) {
        let sum = 0n
        for (const hash of hashes) {
            const block = await this.getBlockByHash(hash)
            sum += Blockchain.difficultyToWork(block.difficulty)
        }
        return sum
    }
    static getLoadPercent(a, b) {
        return Math.floor((1 - (a / (b))) * 100)
    }
    loadBlockHashes(hash: Buffer) {
        return new Promise<void>((resolve, reject) => {
            const forks = new Map()
            let i = 0
            const loadPreviousBlock = async (block: Block) => {
                if (i++ === 2) {
                    this.addresses = new Map()
                    log.debug(2, 'Found new fork')
                } 
                const hash = this.hashes[block.height]
                if (hash?.equals(block.hash)) return resolve()
                this.hashes[block.height] = block.hash
                if (block.height === 0) return resolve()
                const previousBlock = await this.getBlockByHash(block.previousHash)
                loadPreviousBlock(previousBlock)
            }
            const loadNextBlock = (previousHash: Buffer) => {
                this.hashesDB.get(previousHash, async (err, hashes) => {
                    const work = forks.get(previousHash.toString('hex'))?.work || 0n
                    if (hashes) {
                        hashes = hashes.map(e => Buffer.from(e))
                        for (const hash of hashes) {
                            forks.delete(previousHash.toString('hex'))
                            const block = await this.getBlockByHash(hash)
                            // console.log(block)
                            if (err) reject(err)
                            if (block) {
                                forks.set(hash.toString('hex'), { work: work + Blockchain.difficultyToWork(block.difficulty), done: false })
                                return loadNextBlock(block.hash)
                            }
                        }
                    }
                    else {
                        forks.set(previousHash.toString('hex'), { work, done: true })
                        // console.log(forks)
                        let done = true
                        for (const fork of forks) {
                            if (fork[1].done === false) done = false
                        }
                        if (!done) return
                        const _forks = []
                        for (const fork of forks) {
                            _forks.push({
                                hash: fork[0],
                                ...fork[1]
                            })
                        }
                        const fork = _forks.sort((b, a) => (a.work < b.work) ? -1 : ((a.work > b.work) ? 1 : 0))[0]
                        // console.log(fork)
                        loadPreviousBlock(await this.getBlockByHash(Buffer.from(fork.hash, 'hex')))
                    }
                })
            }
            loadNextBlock(hash)
        })
    }
    async createGenesisBlock() {
        const block = new Block({
            transactions: [],
            previousHash: Buffer.alloc(32, 0x00),
            height: 0,
            difficulty: 1 << config_core.smoothness,
            nonce: 0,
            timestamp: this.genesisBlockTimestamp
        })
        block.hash = await Block.calculateHash(block)
        return block
    }
    async getLatestBlock() {
        if (!this.hashes.length) return this.genesisBlock
        return await this.getBlockByHash(this.hashes[this.hashes.length - 1])
    }
    async addTransaction(transaction: Transaction) {
        if (this.pendingTransactions.find(_transaction => Transaction.calculateHash(transaction).equals(Transaction.calculateHash(_transaction)))) return 1
        const block = await this.getLatestBlock()
            if (transaction.timestamp < block.timestamp) return 2
            let sum = parseBigInt(transaction.minerFee)
            if (transaction.amount) sum += parseBigInt(transaction.amount)
            for (const { from, amount, minerFee } of this.pendingTransactions) {
                if (transaction.from.equals(from)) {
                    sum += parseBigInt(minerFee)
                    if (amount) sum += parseBigInt(amount)
                }
            }
        if (await this.getBalanceOfAddress(transaction.from) < sum) return 3
        const { bigint, remainder } = transaction.byteFee()
        if (bigint < this.minByteFee.bigint
        || (bigint === this.minByteFee.bigint && remainder <= this.minByteFee.remainder)) return 4
        this.pendingTransactions.push(transaction)
        return 0
    }
    async addBlock(block: Block) {
        let previousBlock = null
        try  {
            previousBlock = await this.getBlockByHash(block.previousHash)
        }
        catch {}
        if (!previousBlock) previousBlock = this.genesisBlock
        try {
            if (block.timestamp <= previousBlock.timestamp) return 2
            if (await this.isPartOfChainValid([
                previousBlock,
                block
            ]) !== 0) return 3
            const data = Block.minify(block)
            delete data[config_minify.block.hash]
            await this.blocksDB.put(block.hash, data)
            let hashes = await this.getHashesByPreviousHash(previousBlock.hash)
            if (hashes) hashes = [...hashes, block.hash]
            else hashes = [block.hash]
            await this.hashesDB.put(previousBlock.hash, hashes)
            for (const transaction of block.transactions) {
                if (transaction.to && this.addresses.has(transaction.to.toString('hex'))) {
                    let balance = this.addresses.get(transaction.to.toString('hex'))
                    balance += parseBigInt(transaction.amount)
                    this.addresses.set(transaction.to.toString('hex'), balance)
                }
                if (transaction.from && this.addresses.has(transaction.from.toString('hex'))) {
                    let balance = this.addresses.get(transaction.from.toString('hex'))
                    if (transaction.amount) balance -= parseBigInt(transaction.amount) + parseBigInt(transaction.minerFee)
                    else balance -= parseBigInt(transaction.minerFee)
                    this.addresses.set(transaction.from.toString('hex'), balance)
                }
            }
            log.debug(4, 'Looking for fork')
            await this.loadBlockHashes(previousBlock.hash)
            return 0
        }
        catch {
            return 4
        }
    }
    async getBalanceOfAddress(address: Buffer) {
        if (this.addresses.has(address.toString('hex'))) return this.addresses.get(address.toString('hex'))
        if (!this.loaded) return null
        const getBalance = (transactions) => {
            let balance = 0n
            for (const transaction of transactions) {
                if (transaction.from?.equals(address)) {
                    if (transaction.amount) balance -= parseBigInt(transaction.amount) + parseBigInt(transaction.minerFee)
                    else balance -= parseBigInt(transaction.minerFee)
                }
                if (transaction.to?.equals(address)) {
                    balance += parseBigInt(transaction.amount)
                }
            }
            return balance
        }
        let balance = 0n
        for (const hash of this.hashes) {
            const block = await this.getBlockByHash(hash)
            balance += getBalance(block.transactions)
        }
        this.addresses.set(address.toString('hex'), balance)
        return balance
    }
    async isPartOfChainValid(chain: Array<Block>) {
        for (let i = 1; i < chain.length; i++) {
            const block = chain[i]
            const previousBlock = chain[i - 1]
            if (previousBlock.height !== block.height - 1) return 1
            if (Blockchain.getBlockDifficulty([ previousBlock, block ]) !== block.difficulty) return 2
            if (block.previousHash.equals(previousBlock.hash) === false) return 3
            for (const transaction of block.transactions) {
                if (transaction.timestamp < previousBlock.timestamp) return 4
            }
            for (const transaction of previousBlock.transactions) {
                if (transaction.timestamp >= block.timestamp) return 5
            }
            if (await block.isValid() !== 0) return 6
            for (let i = 1; i < block.transactions.length; i++) {
                const transaction = block.transactions[i]
                let sum = 0n
                for (let j = 1; j < block.transactions.length; j++) {
                    const _transaction = block.transactions[j]
                    if (transaction.from.equals(_transaction.from)) {
                        sum += parseBigInt(_transaction.minerFee)
                        if (_transaction.amount) sum += parseBigInt(_transaction.amount)
                    }
                }
                if (await this.getBalanceOfAddress(transaction.from) < sum) return 7
            }
        }
        return 0
    }
    static getBlockDifficulty(blocks: Array<Block>) {
        let difficulty = blocks[0].difficulty
        const time = blocks[1].timestamp - blocks[0].timestamp,
        _time = config_core.blockTime / 1.5
        if (time < _time && difficulty < 64 << config_core.smoothness) difficulty++
        else if (time >= _time && difficulty > 1 << config_core.smoothness) difficulty--
        return difficulty
    }
    async getHashesByPreviousHash(previousHash: Buffer) {
        try {
            return Array<Buffer> (await this.hashesDB.get(previousHash)).map(e => Buffer.from(e))
        }
        catch {
            return []
        }
    }
    async getBlockByHash(hash: Buffer) {
        if (this.genesisBlock.hash.equals(hash)) return this.genesisBlock
        try {
            const data = { [config_minify.block.hash]: hash, ...(await this.blocksDB.get(hash)) }
            return new Block(Block.beautify(data))
        }
        catch {
            return null
        }
    }
    async getBlockByPreviousHash(previousHash: Buffer) {
        if (this.genesisBlock.previousHash.equals(previousHash)) return this.genesisBlock
        const hashes = await this.getHashesByPreviousHash(previousHash)
        for (const hash of hashes) {
            if (this.hashes.find(e => e.equals(hash))) {
                return await this.getBlockByHash(hash)
            }
        }
    }
    async getBlockByHeight(height: number) {
        if (height === 0) return this.genesisBlock
        const hash = this.hashes[height]
        if (!hash) return null
        return await this.getBlockByHash(hash)
    }
    async getNewBlock(address: Buffer) {
        this.minByteFee = {
            bigint: parseBigInt(config_settings.minByteFee.bigint),
            remainder: parseBigInt(config_settings.minByteFee.remainder)
        }
        const previousBlock = await this.getLatestBlock()
        this.pendingTransactions = this.pendingTransactions
            .filter(e => e.timestamp >= previousBlock.timestamp)
            .sort((a, b) => {
                const byteLength = {
                    a: BigInt(Buffer.byteLength(JSON.stringify(Transaction.minify(a)))),
                    b: BigInt(Buffer.byteLength(JSON.stringify(Transaction.minify(b))))
                }
                const minerFee = {
                    a: parseBigInt(a.minerFee),
                    b: parseBigInt(b.minerFee)
                }
                const div = {
                    a: minerFee.a / byteLength.a,
                    b: minerFee.b / byteLength.b
                }
                if (div.b - div.a < 0) return -1
                else if (div.b - div.a > 0) return 1
                const remainder = {
                    a: minerFee.a % byteLength.a,
                    b: minerFee.b % byteLength.b
                }
                if (remainder.b < remainder.a) return -1
                else if (remainder.b > remainder.a) return 1
                else return 0
            })
        const transactions = [
            new Transaction({
                to: address,
                amount: beautifyBigInt(parseBigInt(config_core.blockReward))
            }),
            ...this.pendingTransactions.filter(transaction => transaction.timestamp < Date.now())
        ]
        const block = new Block({
            transactions,
            previousHash: previousBlock.hash,
            height: previousBlock.height + 1
        })
        for (let i = 0; i < block.transactions.length; i++) {
            if (i === 0) continue
            block.transactions[0].amount = beautifyBigInt(parseBigInt(block.transactions[0].amount) + parseBigInt(block.transactions[i].minerFee))
        }
        while (Buffer.byteLength(JSON.stringify(Block.minify(block))) > config_core.maxBlockSize - 2**8) {
            const transaction = block.transactions.pop()
            block.transactions[0].amount = beautifyBigInt(parseBigInt(block.transactions[0].amount) - parseBigInt(transaction.minerFee))
            if (block.transactions.length === 1) break
            this.minByteFee = block.transactions[block.transactions.length - 1].byteFee()
        }
        return block
    }
}
export default Blockchain