import Transaction from './Transaction'
import Block from './Block'
import * as config from '../../config.json'
import load_blocks from '../load_blocks'
import schema_block from '../mongoose/schema/block'
interface Blockchain {
    chain: Array<Block>
    difficulty: number
    pendingTransactions: Array<Transaction>
}
class Blockchain {
    constructor() {
        this.difficulty = config.mining.difficulty
        this.pendingTransactions = []
        this.chain = []
    }
    createGenesisBlock() {
        return new Block({
            timestamp: Date.now(),
            transactions: [],
            previousHash: '',
            height: 0
        })
    }
    getLatestBlock() {
        const block = this.chain[this.chain.length - 1]
        if (block) return block
        else return this.createGenesisBlock()
    }
    shiftChain() {
        while (this.chain.length > config.length.inMemoryChain) this.chain.shift()
    }
    async addTransaction(transaction: Transaction) {
        if (!transaction.fromAddress || !transaction.toAddress) return 1
        if (!transaction.isValid()) return 2
        if (transaction.blockHeight !== this.getLatestBlock().height + 1) return 3
        if (transaction.amount <= 0) return 4
        if (this.pendingTransactions.find(e => e.fromAddress === transaction.fromAddress)) return 5
        if (transaction.minerFee > transaction.amount) return 6
        if (transaction.minerFee < 0) return 7
        if (await this.getBalanceOfAddress(transaction.fromAddress) < transaction.amount) return 8
        this.pendingTransactions.push(transaction)
        return 0
    }
    async addBlock(block) {
        if (!Blockchain.isPartOfChainValid([this.getLatestBlock(), block])) return 1
        this.chain.push(block)
        this.shiftChain()
        // console.log(this.chain.length)
        return 0
    }
    async getBalanceOfAddress(address: string) {
        let i = 0, balance = 0
        while (true) {
            const blocks = await schema_block
                .find({
                    transactions: {
                        $elemMatch: {
                            $or: [
                                { fromAddress: address },
                                { toAddress: address }
                            ]
                        }
                    }
                }, 'transactions', { limit: config.limit.blocksPerQuery, skip: i * config.limit.blocksPerQuery })
                .exec()
            if (!blocks || !blocks.length) break
            for (const block of blocks) {
                for (const transaction of block.transactions) {
                    if (transaction.fromAddress === address) {
                        balance -= transaction.amount
                    }
                    if (transaction.toAddress === address) {
                        balance += transaction.amount
                    }
                }
            }
            i++
        }
        return balance
    }
    static isPartOfChainValid(chain: Array<Block>) {
        for (let i = 1; i < chain.length; i++) {
            const currentBlock = chain[i]
            const previousBlock = chain[i - 1]
            if (!currentBlock.hasValidTransactions()) {
                console.log('!currentBlock.hasValidTransactions()')
                return false
            }
            if (currentBlock.hash !== currentBlock.calculateHash()) {
                console.log('currentBlock.hash !== currentBlock.calculateHash()')
                return false
            }
            if (currentBlock.previousHash !== previousBlock.hash) {
                console.log('currentBlock.previousHash !== previousBlock.hash')
                console.log(currentBlock.previousHash, previousBlock.hash)
                return false
            }
        }
        return true
    }
    async isChainValid() {
        let i = 0
        while (true) {
            let blocks = await load_blocks(config.limit.blocksPerQuery, i * (config.limit.blocksPerQuery - 1))
            if (!blocks.length) break
            if (!Blockchain.isPartOfChainValid(blocks)) return false
            i++
        }
        return true
    }
    async load_blocks(limit: number, skip: number) {
        if (limit > config.length.inMemoryChain) throw new Error('Cannot load more blocks than maxInMemoryChainLength!')
        if (skip < 0) skip = 0
        this.chain = await load_blocks(limit, skip)
        // this.chain.push(...await load_blocks(limit, skip))
        // this.chain = [
        //     ...await load_blocks(limit, skip),
        //     ...this.chain
        // ]
        // this.shiftChain()
    }
    async loadLatestBlocks(limit: number) {
        const chainLength = await schema_block
            .countDocuments()
            // .estimatedDocumentCount()
            .exec()
        // console.log('chainLength', chainLength)
        await this.load_blocks(limit, chainLength - limit)
    }
}
export default Blockchain