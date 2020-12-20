import * as config from '../config.json'
import Transaction from './Transaction'
import Block from './Block'
import model_block from './mongoose/model/block'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
interface Blockchain {
    difficulty: number
    pendingTransactions: Array<Transaction>
    syncIndex: number
}
class Blockchain {
    constructor() {
        this.difficulty = 0
        this.pendingTransactions = []
        this.syncIndex = 0
    }
    createGenesisBlock() {
        return new Block({
            transactions: [],
            previousHash: Buffer.alloc(32, 0x00),
            height: 0,
            difficulty: this.difficulty
        })
    }
    async getLatestBlock() {
        const block = await Block.load(null, null, { sort: { [config.block.height.name]: -1, [config.block.difficulty.name]: -1 }, lean: true })
        if (!block) return this.createGenesisBlock()
        return block
    }
    async addTransaction(transaction: Transaction) {
        // sync
        // from
        if (typeof transaction.from !== 'object') return 1
        if (transaction.from instanceof Buffer === false) return 2
        // to
        if (typeof transaction.to === 'object') {
            if (transaction.to instanceof Buffer === false) return 3
            if (Buffer.byteLength(transaction.to) !== 20) return 4
            // amount
            if (typeof transaction.amount !== 'string') return 5
            const amount = parseBigInt(transaction.amount)
            if (amount === null
                || amount <= 0
                || beautifyBigInt(amount) !== transaction.amount) return 6
        }
        else if (typeof transaction.to !== 'undefined') return 7
        // signature
        if (typeof transaction.signature !== 'object') return 8
        if (transaction.signature instanceof Buffer === false) return 9
        // data
        if (typeof transaction.data === 'object') {
            if (transaction.data instanceof Buffer === false) return 10
            if (Buffer.byteLength(transaction.data) === 0) return 11
        }
        else if (typeof transaction.data !== 'undefined') return 12
        // timestamp
        if (typeof transaction.timestamp !== 'number') return 13
        if (transaction.timestamp > Date.now()) return 14
        // minerFee
        if (typeof transaction.minerFee !== 'string') return 15
        const minerFee = parseBigInt(transaction.minerFee)
            if (minerFee === null
                || minerFee < 0
                || beautifyBigInt(minerFee) !== transaction.minerFee) return 16
        // recoveryParam
        if (typeof transaction.recoveryParam !== 'number') return 17
        if (transaction.recoveryParam >> 2) return 18
        // verify
        if (this.pendingTransactions.find(e => e.calculateHash().equals(transaction.calculateHash()))) return 19
        if (!transaction.verify()) return 20
        // async
        if (transaction.timestamp < (await this.getLatestBlock()).timestamp) return 21
        let sum = parseBigInt(transaction.minerFee)
        if (transaction.amount) sum += parseBigInt(transaction.amount)
        if (await this.getBalanceOfAddress(transaction.from) < sum) return 22
        // !
        // limit amount of transactions from address to not slow down database when calculating balance
        // if ((await this.getTransactionsOfAddress(transaction.from)).length >= config.maxTransactions) return 23
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
        if (block.timestamp > Date.now()) return 10
        if (Buffer.byteLength(JSON.stringify(block)) > config.mining.blockSize) return 11
        // async
        if (block.height < await this.getHeight() - config.mining.trustedAfterBlocks) return 12
        const previousBlock = await Block.load({ [config.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
        if (previousBlock) {
            if (block.timestamp <= previousBlock.timestamp) return 13
            const valid = Blockchain.isPartOfChainValid([
                previousBlock,
                block
            ])
            if (valid === false) return 14
        }
        else if (block.height !== 0) return 15
        if (await Block.exists({ [config.block.hash.name]: block.hash.toString('binary') })) return 16
        await block.save()
        return 0
    }
    async getTransactionsOfAddress(address: Buffer, projection: string | null = null) {
        const query = {
            $or: [
                { [`${config.block.transactions.name}.${config.transaction.to.name}`]: address.toString('binary') },
                { [`${config.block.transactions.name}.${config.transaction.from.name}`]: address.toString('binary') }
            ]
        }
        const blocks = (await Block.loadMany(query, projection, { lean: true })).sort((a, b) => b.height - a.height),
        transactions = []
        const _blocks = blocks.filter(e => e.height === blocks[0].height)
        let block = _blocks.sort((a, b) => b.difficulty - a.difficulty)[0]
        while (block) {
            for (const transaction of block.transactions) {
                if ((transaction.from && address.equals(transaction.from))
                    || (transaction.to && address.equals(transaction.to))) {
                    if (!transaction.timestamp && projection && projection.indexOf('timestamp') !== -1 || !projection) transaction.timestamp = block.timestamp
                    transactions.push(transaction)
                }
            }
            block = blocks.find(e => e.hash.equals(block.previousHash))
        }
        return transactions
    }
    async getBalanceOfAddress(address: Buffer) {
        const transactions = await this.getTransactionsOfAddress(address, `
            ${config.block.height.name}
            ${config.block.difficulty.name}
            ${config.block.hash.name}
            ${config.block.previousHash.name}
            ${config.block.transactions.name}.${config.transaction.to.name}
            ${config.block.transactions.name}.${config.transaction.from.name}
            ${config.block.transactions.name}.${config.transaction.amount.name}
            ${config.block.transactions.name}.${config.transaction.minerFee.name}
        `)
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
    static isPartOfChainValid(chain: Array<Block>) {
        // i = 2
        for (let i = 1; i < chain.length; i++) {
            const currentBlock = chain[i]
            const previousBlock = chain[i - 1]
            if (previousBlock.height !== currentBlock.height - 1) return false
            if (!currentBlock.meetsDifficulty()) return false
            if (!currentBlock.hasValidTransactions()) return false
            if (!currentBlock.hash.equals(currentBlock.calculateHash())) return false
            if (!currentBlock.previousHash.equals(previousBlock.hash)) return false
            for (const transaction of currentBlock.transactions) {
                if (transaction.timestamp < previousBlock.timestamp) return false
            }
            for (const transaction of previousBlock.transactions) {
                if (transaction.timestamp >= currentBlock.timestamp) return false
            }
        }
        for (let i = 2; i < chain.length; i++) {
            const blocks = [
                chain[i - 2],
                chain[i - 1],
                chain[i]
            ]
            const difficulty = this.getNextDifficulty(blocks)
            if (blocks[2].difficulty !== difficulty) return false
        }
        return true
    }
    async isChainValid() {
    // async isChainValid(limit: number = 0) {
        let block = await this.getLatestBlock()
        let previousBlocks = []
        let blocks = []
        // let counter = 0
        while (true) {
            for (let i = 0; i < 2; i++) {
                if (!block) break
                block = await Block.load({ [config.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
                if (!block) break
                blocks.unshift(block)
                // counter++
            }
            if (!blocks.length) break
            blocks = [
                ...blocks,
                ...previousBlocks
            ]
            // return object with info about invalidity
            if (!Blockchain.isPartOfChainValid(blocks)) return false
            // if (limit !== 0 && counter >= limit) break
            previousBlocks = [
                blocks[0],
                blocks[1]
            ]
            blocks = []
        }
        return true
    }
    async getWork() {
        let block = await Block.load(null, null, { sort: { height: -1, difficulty: -1 }, lean: true }),
        work = 0
        while (true) {
            if (!block) break
            block = await Block.load({ [config.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
            if (!block) break
            work += Math.pow(2, block.difficulty)
        }
        return work
    }
    async updateDifficulty() {
        const blocks = [ await this.getLatestBlock() ]
        blocks.unshift(await Block.load({ [config.block.hash.name]: blocks[0].previousHash.toString('binary') }, null, { lean: true }))
        if (!blocks[0]) return
        this.difficulty = Blockchain.getNextDifficulty(blocks)
    }
    static getNextDifficulty(blocks: Array<Block>) {
        let difficulty = blocks[1].difficulty
        const blockTime = blocks[1].timestamp - blocks[0].timestamp
        if (blockTime < config.mining.blockTime && difficulty < 64) difficulty++
        else if (blockTime >= config.mining.blockTime && difficulty > 0) difficulty--
        return difficulty
    }
    async deleteAllBlocksNotIncludedInChain() {
        const hashes = []
        let block = await this.getLatestBlock()
        while (block) {
            hashes.push(block.hash.toString('binary'))
            block = await Block.load({ [config.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
        }
        if (!hashes.length) return
        const info = await model_block
            .deleteMany({
                [config.block.hash.name]: {
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
        let block = await this.getLatestBlock()
        // !
        while (true) {
            if (!block) break
            block = await Block.load({ [config.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
            if (!block || block.height === height) break
        }
        if (!block || block.height !== height) return null
        return block
    }
    // !
    // calling this function when pendingtransactions is full and the transaction does not get added will result in people being able to abuse the miner by keeping sending transaction with 0 mining reward
    // resetting the miners nonce resulting in miner being stuck without being able to reach the nonce where it mines block
    // but new block is generated with new timestamp so nonce does not matter
    async getNewBlock(address: Buffer) {
        const previousBlock = await this.getLatestBlock()
        if (previousBlock.height === 0) await previousBlock.save()
        const transactions = [
            new Transaction({
                to: address,
                amount: beautifyBigInt(parseBigInt(config.mining.reward))
            }),
            ...this.pendingTransactions
                .filter(e => e.timestamp >= previousBlock.timestamp)
                .sort((a, b) => {
                    const byteLength = {
                        a: BigInt(Buffer.byteLength(JSON.stringify(a))),
                        b: BigInt(Buffer.byteLength(JSON.stringify(b)))
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
        ]
        await this.updateDifficulty()
        const block = new Block({
            transactions,
            previousHash: previousBlock.hash,
            height: previousBlock.height + 1,
            difficulty: this.difficulty
        })
        for (let i = 0; i < block.transactions.length; i++) {
            if (i === 0) continue
            block.transactions[0].amount = beautifyBigInt(parseBigInt(block.transactions[0].amount) + parseBigInt(block.transactions[i].minerFee))
        }
        while (Buffer.byteLength(JSON.stringify(block)) > config.mining.blockSize) {
            const transaction = block.transactions.pop()
            block.transactions[0].amount = beautifyBigInt(parseBigInt(block.transactions[0].amount) - parseBigInt(transaction.minerFee))
        }
        return block
    }
    async getNextSyncBlock() {
        const block = await this.getBlockByHeight(this.syncIndex++)
        if (this.syncIndex >= await this.getHeight()) this.syncIndex = 0
        return block
    }
    async getCircumlatingSupply() {
        return BigInt(await this.getHeight()) * parseBigInt(config.mining.reward)
    }
    async getTotalTransactions(timestamp: number | null = null) {
        let block = await this.getLatestBlock(),
        transactions = 0
        while (block && (timestamp === null || timestamp <= block.timestamp)) {
            transactions += block.transactions.length
            block = await Block.load({ [config.block.hash.name]: block.previousHash.toString('binary') }, null, { lean: true })
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