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
}
class Blockchain extends events.EventEmitter {
    constructor() {
        super()
        this.pendingTransactions = []
        this.syncIndex = 0
        this.updatingBlockHashes = false
        this.updateBlockHashes()
    }
    async setBlockHashes() {
        this.hashes = {
            old: [],
            current: [],
            new: []
        }
        let block = await this.setLatestBlock()
        while (block) {
            this.hashes.current.unshift(block.hash.toString('binary'))
            block = await Block.load({ [config.mongoose.schema.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
        }
    }
    async updateBlockHashes() {
        if (this.updatingBlockHashes) {
            return <void> await new Promise(resolve => this.once('updated-block-hashes', () => resolve()))
        }
        this.updatingBlockHashes = true
        if (!this.hashes || this.hashes.current.length === 1) await this.setBlockHashes()
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
        // !
        // const oldHashes = this.hashes.current.splice(index + 1, this.hashes.current.length, ...newHashes)
        // console.log(this.hashes.current[this.hashes.current.length - 1].toString('hex'), this.hashes.current[this.hashes.current.length - 2].toString('hex'), this.hashes.current[this.hashes.current.length - 3].toString('hex'))
        if (index !== null) {
            this.hashes.old = this.hashes.current.slice(index + 1)
            this.hashes.current = this.hashes.current.slice(0, index + 1)
            this.hashes.current.push(...newHashes)
            this.hashes.new = newHashes
        }
        this.emit('updated-block-hashes')
        this.updatingBlockHashes = false
    }
    createGenesisBlock() {
        return new Block({
            transactions: [],
            previousHash: Buffer.alloc(32, 0x00),
            height: 0,
            difficulty: 0
        })
    }
    async setLatestBlock() {
        let block = await Block.load(null, null, { sort: { [config.mongoose.schema.block.height.name]: -1, [config.mongoose.schema.block.difficulty.name]: -1 }, lean: true })
        if (block === null) block = this.createGenesisBlock()
        this.latestBlock = block
        return block
    }
    async getLatestBlock() {
        if (!this.latestBlock) await this.setLatestBlock()
        return this.latestBlock
    }
    async addTransaction(transaction: Transaction) {
        // sync
        if (transaction.isValid() !== 0) return 1
        // verify
        if (Buffer.byteLength(JSON.stringify(Transaction.minify(transaction))) > config.Blockchain.maxTransactionSize) return 2
        if (this.pendingTransactions.find(_transaction => Transaction.calculateHash(transaction).equals(Transaction.calculateHash(_transaction)))) return 3
        if (!transaction.verify()) return 4
        // async
        if (transaction.timestamp < (await this.getLatestBlock()).timestamp) return 5
        let sum = parseBigInt(transaction.minerFee)
        if (transaction.amount) sum += parseBigInt(transaction.amount)
        if (await this.getBalanceOfAddress(transaction.from) < sum) return 6
        // !
        // limit amount of transactions from address to not slow down database when calculating balance
        // if ((await this.getTransactionsOfAddress(transaction.from)).length >= config.maxTransactions) return 23
        const { bigint, remainder } = transaction.byteFee()
        if (bigint < this.minByteFee.bigint
        || (bigint === this.minByteFee.bigint && remainder <= this.minByteFee.remainder)) return 7
        this.pendingTransactions.push(transaction)
        return 0
    }
    async addBlock(block: Block) {
        // sync
        if (typeof block.nonce !== 'number') return 1
        if (typeof block.height !== 'number') return 2
        if (typeof block.timestamp !== 'number') return 3
        if (typeof block.difficulty !== 'number') return 4
        if (typeof block.hash !== 'object') return 5
        if (typeof block.previousHash !== 'object') return 6
        if (block.hash instanceof Buffer === false) return 7
        if (block.previousHash instanceof Buffer === false) return 8
        if (Array.isArray(block.transactions) === false) return 9
        if (block.timestamp > Date.now() + config.Blockchain.maxDesync) return 10
        if (Buffer.byteLength(JSON.stringify(Block.minify(block))) > config.Blockchain.maxBlockSize) return 11
        // async
        if (block.hash.equals(await Block.calculateHash(block)) === false) return 12
        if (block.height < await this.getHeight() - config.Blockchain.trustedAfterBlocks) return 13
        const previousBlock = await Block.load({ [config.mongoose.schema.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
        if (previousBlock) {
            if (block.timestamp <= previousBlock.timestamp) return 14
            const valid = await Blockchain.isPartOfChainValid([
                previousBlock,
                block
            ])
            if (valid === false) return 15
        }
        else if (block.height !== 0) return 16
        if (await Block.exists({ [config.mongoose.schema.block.hash.name]: block.hash.toString('binary') })) {
            if ((await this.getLatestBlock()).hash.equals(block.hash)) {
                await this.updateBlockHashes()
                return 17
            }
            return 18
        }
        await block.save()
        await this.updateBlockHashes()
        if ((await this.getLatestBlock()).hash.equals(block.hash)) {
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
    async getTransactionsOfAddress(address: Buffer, projection: string | null = null, optimization: boolean = false) {
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
                    if ((transaction.from && address.equals(transaction.from))
                        || (transaction.to && address.equals(transaction.to))) {
                        if (!transaction.timestamp && projection && projection.indexOf('timestamp') !== -1 || !projection) transaction.timestamp = block.timestamp
                        transactions.push(transaction)
                    }
                }
            }
            return transactions
        }
        if (optimization) return {
            transactions: getTransactions(blocks),
            old_transactions: getTransactions(old_blocks)
        }
        else return {
            transactions: getTransactions(blocks)
        }
    }
    async getBalanceOfAddress(address: Buffer, enableChanceToNotUseOptimization: boolean = false) {
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
                        return parseBigInt(document[config.mongoose.schema.address.balance.name])
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
                if (transaction.from && address.equals(transaction.from)) {
                    if (transaction.amount) balance -= parseBigInt(transaction.amount) + parseBigInt(transaction.minerFee)
                    else balance -= parseBigInt(transaction.minerFee)
                }
                if (transaction.to && address.equals(transaction.to)) {
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
        return balance
    }
    static async isPartOfChainValid(chain: Array<Block>) {
        for (let i = 1; i < chain.length; i++) {
            const currentBlock = chain[i]
            const previousBlock = chain[i - 1]
            if (previousBlock.height !== currentBlock.height - 1) return false
            if (Blockchain.getBlockDifficulty([ previousBlock, currentBlock ]) !== currentBlock.difficulty) return false
            if (!currentBlock.meetsDifficulty()) return false
            if (!currentBlock.hasValidTransactions()) return false
            if (!currentBlock.hash.equals(await Block.calculateHash(currentBlock))) return false
            if (!currentBlock.previousHash.equals(previousBlock.hash)) return false
            for (const transaction of currentBlock.transactions) {
                if (transaction.timestamp < previousBlock.timestamp) return false
            }
            for (const transaction of previousBlock.transactions) {
                if (transaction.timestamp >= currentBlock.timestamp) return false
            }
        }
        return true
    }
    async isChainValid() {
        let blocks = [ await this.getLatestBlock() ]
        blocks.unshift(await Block.load({ [config.mongoose.schema.block.hash.name]: blocks[0].previousHash.toString('binary') }, null, { lean: true }))
        while (blocks[0]) {
            if (await Blockchain.isPartOfChainValid(blocks) === false) return false
            blocks.unshift(await Block.load({ [config.mongoose.schema.block.hash.name]: blocks[0].previousHash.toString('binary') }, null, { lean: true }))
            blocks = blocks.slice(0, 2)
            if (blocks[0].height === 0) break
        }
        return true
    }
    async getWork() {
        let block = await Block.load(null, null, { sort: { height: -1, difficulty: -1 }, lean: true }),
        work = 0
        while (true) {
            if (!block) break
            block = await Block.load({ [config.mongoose.schema.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
            if (!block) break
            work += Math.pow(2, block.difficulty)
        }
        return work
    }
    static getBlockDifficulty(blocks: Array<Block>) {
        let difficulty = blocks[0].difficulty
        const time = blocks[1].timestamp - blocks[0].timestamp
        if (time < config.Blockchain.blockTime && difficulty < 64) difficulty++
        else if (time >= config.Blockchain.blockTime && difficulty > 0) difficulty--
        return difficulty
    }
    async deleteAllBlocksNotIncludedInChain() {
        const hashes = []
        let block = await this.getLatestBlock()
        while (block) {
            hashes.push(block.hash.toString('binary'))
            block = await Block.load({ [config.mongoose.schema.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
        }
        if (!hashes.length) return
        const info = await model_block
            .deleteMany({
                [config.mongoose.schema.block.hash.name]: {
                    $not: {
                        $in: hashes
                    }
                }
            })
            .exec()
        return info
    }
    // !
    async getBlockByHeight(height: number) {
        return await Block.load({
            [config.mongoose.schema.block.height.name]: height,
            [config.mongoose.schema.block.hash.name]: {
                $in: this.hashes.current
            }
        }, null, { lean: true })
        // let block = await this.getLatestBlock()
        // // !
        // while (true) {
        //     if (!block) break
        //     block = await Block.load({ [config.mongoose.schema.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
        //     if (!block || block.height === height) break
        // }
        // if (!block || block.height !== height) return null
        // return block
    }
    async getNewBlock(address: Buffer) {
        this.minByteFee = {
            bigint: parseBigInt(config.Blockchain.minByteFee.bigint),
            remainder: parseBigInt(config.Blockchain.minByteFee.remainder)
        }
        const previousBlock = await this.getLatestBlock()
        if (previousBlock.height === 0) {
            previousBlock.hash = await Block.calculateHash(previousBlock)
            await this.addBlock(previousBlock)
        }
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
        while (Buffer.byteLength(JSON.stringify(Block.minify(block))) > config.Blockchain.maxBlockSize) {
            const transaction = block.transactions.pop()
            block.transactions[0].amount = beautifyBigInt(parseBigInt(block.transactions[0].amount) - parseBigInt(transaction.minerFee))
            // !
            if (block.transactions.length === 1) break
            this.minByteFee = block.transactions[block.transactions.length - 1].byteFee()
            console.log(this.minByteFee)
        }
        return block
    }
    async getNextSyncBlock() {
        const block = await this.getBlockByHeight(this.syncIndex++)
        if (this.syncIndex > await this.getHeight()) this.syncIndex = 0
        return block
    }
    async getCircumlatingSupply() {
        return BigInt(await this.getHeight()) * parseBigInt(config.Blockchain.blockReward)
    }
    async getTotalTransactions(timestamp: number | null = null) {
        let block = await this.getLatestBlock(),
        transactions = 0
        while (block && (timestamp === null || timestamp <= block.timestamp)) {
            transactions += block.transactions.length
            block = await Block.load({ [config.mongoose.schema.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
        }
        return transactions
    }
    async getHeight() {
        return (await this.getLatestBlock()).height
    }
    async getDifficulty() {
        return Math.pow(2, (await this.getLatestBlock()).difficulty)
    }
}
export default Blockchain