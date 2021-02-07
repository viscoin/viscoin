import * as config from '../config.json'
import Transaction from './Transaction'
import Block from './Block'
import model_block from './mongoose/model/block'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
import model_address from './mongoose/model/address'
import * as events from 'events'
interface Blockchain {
    pendingTransactions: Array<Transaction>
    syncIndex: number
    hashes: {
        old: Array<string>
        current: Array<string>
        new: Array<string>
    }
    updatingBlockHashes: boolean
    latestBlock: Block
    minByteFee: {
        bigint: bigint,
        remainder: bigint
    }
    addresses: object
}
class Blockchain extends events.EventEmitter {
    constructor() {
        super()
        this.pendingTransactions = []
        this.syncIndex = 0
        this.updatingBlockHashes = false
        this.minByteFee = {
            bigint: parseBigInt(config.Blockchain.minByteFee.bigint),
            remainder: parseBigInt(config.Blockchain.minByteFee.remainder)
        }
        this.updateBlockHashes()
        this.addresses = {}
    }
    async setBlockHashes() {
        this.hashes = {
            old: [],
            current: [],
            new: []
        }
        let block = await this.setLatestBlock()
        if (block.height === 0) return
        let height
        while (block) {
            this.hashes.current.unshift(block.hash.toString('binary'))
            height = block.height
            block = await Block.load({ [config.mongoose.schema.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
        }
        if (height !== 1) {
            const info = await model_block
                .deleteMany({
                    [config.mongoose.schema.block.height.name]: {
                        $gte: height
                    }
                })
                .exec()
            console.log(info)
        }
    }
    async updateBlockHashes() {
        if (this.updatingBlockHashes) {
            return <void> await new Promise(resolve => this.once('updated-block-hashes', () => resolve()))
        }
        this.updatingBlockHashes = true
        if (this.hashes === undefined || this.hashes.current.length === 0) await this.setBlockHashes()
        let block = await this.setLatestBlock(),
        index: number = null
        const newHashes: Array<string> = []
        while (block && !index) {
            for (let i = this.hashes.current.length - 1; i >= 0; i--) {
                if (this.hashes.current[i] === block.hash.toString('binary')) {
                    index = i
                    break
                }
                if (i < this.hashes.current.length - 1 - config.Blockchain.trustedAfterBlocks) break
            }
            if (index !== null) break
            newHashes.unshift(block.hash.toString('binary'))
            block = await Block.load({ [config.mongoose.schema.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
        }
        if (index !== null) {
            this.hashes.old = this.hashes.current.slice(index + 1)
            this.hashes.current = this.hashes.current.slice(0, index + 1)
            this.hashes.current.push(...newHashes)
            this.hashes.new = newHashes
        }
        this.emit('updated-block-hashes')
        this.updatingBlockHashes = false
    }
    static async createGenesisBlock() {
        const block = new Block({
            transactions: [],
            previousHash: Buffer.alloc(32, 0x00),
            height: 0,
            difficulty: 1 << config.Blockchain.smoothness,
            nonce: 0,
            timestamp: 0
        })
        block.hash = await Block.calculateHash(block)
        return block
    }
    async setLatestBlock() {
        let block = await Block.load(null, null, { sort: { [config.mongoose.schema.block.height.name]: -1, [config.mongoose.schema.block.difficulty.name]: -1 }, lean: true })
        if (block === null) block = await Blockchain.createGenesisBlock()
        this.latestBlock = block
        return block
    }
    async getLatestBlock() {
        if (!this.latestBlock) await this.setLatestBlock()
        return this.latestBlock
    }
    async addTransaction(transaction: Transaction) {
        if (this.pendingTransactions.find(_transaction => Transaction.calculateHash(transaction).equals(Transaction.calculateHash(_transaction)))) return 1
        if (transaction.timestamp < (await this.getLatestBlock()).timestamp) return 2
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
        if (block.height < await this.getHeight() - config.Blockchain.trustedAfterBlocks) return 1
        const previousBlock = await Block.load({ [config.mongoose.schema.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
        if (previousBlock) {
            if (block.timestamp <= previousBlock.timestamp) return 2
            if (await this.isPartOfChainValid([
                previousBlock,
                block
            ], true) !== 0) return 3
        }
        else if (block.height !== 1 || block.previousHash.equals((await Blockchain.createGenesisBlock()).hash) === false) return 4
        if (await Block.exists({ [config.mongoose.schema.block.hash.name]: block.hash.toString('binary') })) {
            if ((await this.getLatestBlock()).hash.equals(block.hash)) {
                await this.updateBlockHashes()
                return 5
            }
            return 6
        }
        await block.save()
        await this.updateBlockHashes()
        if ((await this.getLatestBlock()).hash.equals(block.hash)) {
            this.addresses = {}
            for (const transaction of block.transactions) {
                if (transaction.to) await this.getBalanceOfAddress(transaction.to, true)
                if (transaction.from) await this.getBalanceOfAddress(transaction.from, true)
            }
        }
        return 0
    }
    async isBalanceValid(address: string, hash: string) {
        const height = this.hashes.current.indexOf(hash)
        if (height === -1) return false
        const blocks = await model_address.find({
            $or: [
                { [`${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.to.name}`]: address },
                { [`${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.from.name}`]: address }
            ],
            [config.mongoose.schema.block.height.name]: {
                $gte: height
            }
        })
        if (blocks.length) return false
        return true
    }
    async getTransactionsOfAddress(address: Buffer, projection: string = undefined, optimization: boolean = false) {
        let blocks = [],
        old_blocks = []
        const baseQuery = {
            $or: [
                { [`${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.to.name}`]: address.toString('binary') },
                { [`${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.from.name}`]: address.toString('binary') }
            ]
        }
        if (optimization) {
            old_blocks = await Block.loadMany({
                ...baseQuery,
                [config.mongoose.schema.block.hash.name]: {
                    $in: this.hashes.old
                }
            }, projection, { lean: true })
            blocks = await Block.loadMany({
                ...baseQuery,
                [config.mongoose.schema.block.hash.name]: {
                    $in: this.hashes.new
                }
            }, projection, { lean: true })
        }
        else {
            blocks = await Block.loadMany(baseQuery, projection, { lean: true })
        }
        const getTransactions = (blocks: Array<{ hash: Buffer, transactions: Array<{ from: Buffer | undefined, to: Buffer | undefined, timestamp: number | undefined }>, timestamp: number | undefined }>) => {
            const transactions = []
            for (const block of blocks) {
                if (this.hashes.current.includes(block.hash.toString('binary')) === false) continue
                for (const transaction of block.transactions) {
                    if (transaction.from?.equals(address)
                    || transaction.to?.equals(address)) {
                        if (transaction.timestamp === undefined) {
                            if (projection === undefined
                            || projection.indexOf(`${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.timestamp.name}`) !== -1) transaction.timestamp = block.timestamp
                        }
                        transactions.push(transaction)
                    }
                }
            }
            return transactions
        }
        if (optimization) return {
            transactions: getTransactions(blocks),
            old_transactions: getTransactions(old_blocks),
            unconfirmed_transactions: this.pendingTransactions.filter(e => e.from?.equals(address) || e.to?.equals(address))
        }
        else return {
            transactions: getTransactions(blocks),
            unconfirmed_transactions: this.pendingTransactions.filter(e => e.from?.equals(address) || e.to?.equals(address))
        }
    }
    async getBalanceOfAddress(address: Buffer, enableChanceToNotUseOptimization: boolean = false) {
        if (this.addresses[address.toString('binary')] !== undefined) {
            return this.addresses[address.toString('binary')]
        }
        const latestBlock = await this.getLatestBlock()
        const document = await model_address.findOne({ [config.mongoose.schema.address.address.name]: address.toString('binary') })
        let optimization = false
        if (document
        && document[config.mongoose.schema.address.balance.name] !== undefined
        && document[config.mongoose.schema.address.hash.name] !== undefined) {
            if (config.Blockchain.optimization.enabled) {
                if (enableChanceToNotUseOptimization === false
                || Math.random() < config.Blockchain.optimization.chanceToNotUse === false) {
                    if (Buffer.from(document[config.mongoose.schema.address.hash.name], 'binary').equals(latestBlock.hash)) {
                        const balance = parseBigInt(document[config.mongoose.schema.address.balance.name])
                        this.addresses[address.toString('binary')] = balance
                        return balance
                    }
                    if (await this.isBalanceValid(address.toString('binary'), document[config.mongoose.schema.address.hash.name])) optimization = true
                }
            }
        }
        const { transactions, old_transactions } = <any> await this.getTransactionsOfAddress(address, `
            ${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.to.name}
            ${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.from.name}
            ${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.amount.name}
            ${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.minerFee.name}
        `, optimization)
        const getBalance = (transactions: Array<{ from: Buffer | undefined, to: Buffer | undefined, amount: string | undefined, minerFee: string }>) => {
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
        if (optimization) {
            balance = parseBigInt(document[config.mongoose.schema.address.balance.name])
            balance -= getBalance(old_transactions)
        }
        balance += getBalance(transactions)
        if (document) {
            document[config.mongoose.schema.address.hash.name] = latestBlock.hash.toString('binary')
            document[config.mongoose.schema.address.balance.name] = beautifyBigInt(balance)
            await document.save()
        }
        else if (!(await model_address.exists({ [config.mongoose.schema.address.address.name]: address.toString('binary') }))) {
            await new model_address({
                [config.mongoose.schema.address.hash.name]: latestBlock.hash.toString('binary'),
                [config.mongoose.schema.address.balance.name]: beautifyBigInt(balance),
                [config.mongoose.schema.address.address.name]: address.toString('binary')
            }).save()
        }
        this.addresses[address.toString('binary')] = balance
        return balance
    }
    async isPartOfChainValid(chain: Array<Block>, optimization: boolean) {
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
            if (optimization === false) {
                if (await block.isValid() !== 0) return 6
            }
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
    async isChainValid() {
        let blocks = [ await this.getLatestBlock() ]
        while (blocks[0] !== null) {
            if (await this.isPartOfChainValid(blocks, false) !== 0) return false
            blocks.unshift(await Block.load({ [config.mongoose.schema.block.hash.name]: blocks[0].previousHash.toString('binary') }, null, { lean: true }))
            blocks = blocks.slice(0, 2)
        }
        return true
    }
    static getBlockDifficulty(blocks: Array<Block>) {
        let difficulty = blocks[0].difficulty
        const time = blocks[1].timestamp - blocks[0].timestamp,
        _time = config.Blockchain.blockTime / 1.5
        if (time < _time && difficulty < 64 << config.Blockchain.smoothness) difficulty++
        else if (time >= _time && difficulty > 1 << config.Blockchain.smoothness) difficulty--
        return difficulty
    }
    async deleteAllBlocksNotIncludedInChain() {
        await this.updateBlockHashes()
        const info = await model_block
            .deleteMany({
                [config.mongoose.schema.block.hash.name]: {
                    $not: {
                        $in: this.hashes.current
                    }
                }
            })
            .exec()
        return info
    }
    async getBlockByHeight(height: number) {
        if (height === 0) return await Blockchain.createGenesisBlock()
        return await Block.load({
            [config.mongoose.schema.block.height.name]: height,
            [config.mongoose.schema.block.hash.name]: {
                $in: this.hashes.current
            }
        }, null, { lean: true })
    }
    async getNewBlock(address: Buffer) {
        this.minByteFee = {
            bigint: parseBigInt(config.Blockchain.minByteFee.bigint),
            remainder: parseBigInt(config.Blockchain.minByteFee.remainder)
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
                amount: beautifyBigInt(parseBigInt(config.Blockchain.blockReward))
            }),
            ...this.pendingTransactions
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
        while (Buffer.byteLength(JSON.stringify(Block.minify(block))) > config.Blockchain.maxBlockSize - 2**8) {
            const transaction = block.transactions.pop()
            block.transactions[0].amount = beautifyBigInt(parseBigInt(block.transactions[0].amount) - parseBigInt(transaction.minerFee))
            if (block.transactions.length === 1) break
            this.minByteFee = block.transactions[block.transactions.length - 1].byteFee()
            // console.log(this.minByteFee)
        }
        // console.log(Buffer.byteLength(JSON.stringify(Block.minify(block))))
        // console.log(block.hasValidTransactions())
        return block
    }
    async getNextSyncBlock() {
        if (++this.syncIndex > await this.getHeight()) this.syncIndex = 1
        return await this.getBlockByHeight(this.syncIndex)
    }
    async getCircumlatingSupply() {
        return BigInt(await this.getHeight()) * parseBigInt(config.Blockchain.blockReward)
    }
    async getHeight() {
        return (await this.getLatestBlock()).height
    }
}
export default Blockchain