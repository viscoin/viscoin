import Transaction from './Transaction'
import Block from './Block'
import * as config from '../../config.json'
import schema_block from '../mongoose/schema/block'
interface Blockchain {
    difficulty: number
    pendingTransactions: Array<Transaction>
}
class Blockchain {
    constructor() {
        this.difficulty = 0
        this.pendingTransactions = []
    }
    createGenesisBlock() {
        const block = new Block({
            transactions: [],
            previousHash: Buffer.alloc(32, 0x00),
            height: 0,
            difficulty: this.difficulty
        })
        block.save()
        return block
    }
    async getLatestBlock() {
        const block = await Block.load(null, null, { sort: { height: -1, difficulty: -1 } })
        if (!block) return this.createGenesisBlock()
        return block
    }
    async addTransaction(transaction: Transaction) {
        if (!transaction.fromAddress || !transaction.toAddress) return 1
        if (!transaction.isValid()) return 2
        if (transaction.timestamp < (await this.getLatestBlock()).timestamp) return 3
        if (transaction.timestamp > Date.now()) return 4
        if (transaction.amount <= 0) return 5
        if (this.pendingTransactions.find(e => e.fromAddress === transaction.fromAddress)) return 6
        if (transaction.minerFee > transaction.amount) return 7
        if (transaction.minerFee < 0) return 8
        if (await this.getBalanceOfAddress(transaction.fromAddress) < transaction.amount) return 9
        this.pendingTransactions.push(transaction)
        return 0
    }
    async addBlock(block) {
        const previousBlock = await Block.load({ hash: block.previousHash, height: block.height - 1 })
        if (!previousBlock) return
        const valid = Blockchain.isPartOfChainValid([
            previousBlock,
            block
        ])
        if (valid) {
            if (!(await Block.exists({ hash: block.hash }))) {
                await block.save()
            }
        }
        // else console.log('not valid')
        await this.updateDifficulty()
    }
    async getBalanceOfAddress(address: string) {
        let block = await this.getLatestBlock(),
        balance = 0
        while (true) {
            if (!block) break
            block = await Block.load({ hash: block.previousHash })
            if (!block) break
            for (const transaction of block.transactions) {
                if (transaction.fromAddress === address) {
                    balance -= transaction.amount
                }
                if (transaction.toAddress === address) {
                    balance += transaction.amount - transaction.minerFee
                }
            }
        }
        return balance
    }
    static isPartOfChainValid(chain: Array<Block>) {
        // i = 2
        for (let i = 1; i < chain.length; i++) {
            const currentBlock = chain[i]
            const previousBlock = chain[i - 1]
            if (!currentBlock.meetsDifficulty()) {
                console.log('!currentBlock.meetsDifficulty()')
                return false
            }
            if (!currentBlock.hasValidTransactions()) {
                console.log('!currentBlock.hasValidTransactions()')
                return false
            }
            if (!currentBlock.hash.equals(currentBlock.calculateHash())) {
                console.log('!currentBlock.hash.equals(currentBlock.calculateHash())')
                console.log(currentBlock.hash.equals(currentBlock.calculateHash()))
                return false
            }
            if (!currentBlock.previousHash.equals(previousBlock.hash)) {
                console.log('!currentBlock.previousHash.equals(previousBlock.hash)')
                console.log(currentBlock.previousHash.equals(previousBlock.hash))
                return false
            }
            for (const transaction of currentBlock.transactions) {
                if (transaction.timestamp < previousBlock.timestamp) {
                    console.log('transaction.timestamp < previousBlock.timestamp')
                    console.log(transaction.timestamp, previousBlock.timestamp)
                    return false
                }
            }
            for (const transaction of previousBlock.transactions) {
                if (transaction.timestamp >= currentBlock.timestamp) {
                    console.log('transaction.timestamp >= currentBlock.timestamp')
                    console.log(transaction.timestamp, currentBlock.timestamp)
                    return false
                }
            }
        }
        for (let i = 2; i < chain.length; i++) {
            const blocks = [
                chain[i - 2],
                chain[i - 1],
                chain[i]
            ]
            let difficulty = blocks[1].difficulty
            const blockTime = blocks[1].timestamp - blocks[0].timestamp
            if (blockTime < config.mining.blockTime && difficulty < 64) {
                difficulty++
            }
            else if (blockTime >= config.mining.blockTime && difficulty > 0) {
            // else if (blockTime > config.mining.blockTime && difficulty > 0) {
                difficulty--
            }
            if (blocks[2].difficulty !== difficulty) {
                console.log('blocks[2].difficulty !== difficulty')
                console.log(blocks[2].difficulty, difficulty)
                return false
            }
        }
        return true
    }
    async isChainValid() {
        let block = await this.getLatestBlock()
        let previousBlocks = []
        let blocks = []
        while (true) {
            for (let i = 0; i < 2; i++) {
                if (!block) break
                block = await Block.load({ hash: block.previousHash })
                if (!block) break
                blocks.unshift(block)
            }
            if (!blocks.length) break
            blocks = [
                ...blocks,
                ...previousBlocks
            ]
            if (!Blockchain.isPartOfChainValid(blocks)) return false
            previousBlocks = [
                blocks[0],
                blocks[1]
            ]
            blocks = []
        }
        return true
    }
    async getWork() {
        let block = await Block.load(null, null, { sort: { height: -1, difficulty: -1 } }),
        work = 0
        while (true) {
            if (!block) break
            block = await Block.load({ hash: block.previousHash })
            if (!block) break
            work += Math.pow(2, block.difficulty)
        }
        return work
    }
    async updateDifficulty() {
        const block_0 = await this.getLatestBlock()
        if (!block_0) return console.log('!block_0')
        const block_1 = await Block.load({ hash: block_0.previousHash })
        if (!block_1) return console.log('!block_1')
        this.difficulty = block_0.difficulty
        const blockTime = block_0.timestamp - block_1.timestamp
        if (blockTime < config.mining.blockTime && this.difficulty < 64) {
            this.difficulty++
        }
        else if (blockTime >= config.mining.blockTime && this.difficulty > 0) {
        // else if (blockTime > config.mining.blockTime && this.difficulty > 0) {
            this.difficulty--
        }
    }
}
export default Blockchain