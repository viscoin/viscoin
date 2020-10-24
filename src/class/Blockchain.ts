import Transaction from './Transaction'
import Block from './Block'
import * as config from '../../config.json'
import load_blocks from '../load_blocks'
import schema_block from '../mongoose/schema/block'
import block from '../mongoose/schema/block'
interface Blockchain {
    chain: Array<Block>
    difficulty: number
    pendingTransactions: Array<Transaction>
    forks: Array<Array<Block>>
}
class Blockchain {
    constructor() {
        this.difficulty = 0
        this.pendingTransactions = []
        this.chain = []
        this.forks = []
        this.updateDifficulty()
    }
    createGenesisBlock() {
        const block = new Block({
            transactions: [],
            previousHash: Buffer.alloc(32, 0x00),
            height: 0,
            difficulty: this.difficulty
        })
        this.chain.push(block)
        return block
    }
    getBlock(index) {
        const block = this.chain[index]
        if (block) return block
        else if (this.chain.length === 0) return this.createGenesisBlock()
        else return null
    }
    getLatestBlock() {
        return this.getBlock(this.chain.length - 1)
    }
    shiftChain() {
        while (this.chain.length > config.length.inMemoryChain) this.chain.shift()
    }
    async addTransaction(transaction: Transaction) {
        if (!transaction.fromAddress || !transaction.toAddress) return 1
        if (!transaction.isValid()) return 2
        if (transaction.timestamp < this.getLatestBlock().timestamp) return 3
        if (transaction.timestamp > Date.now()) return 4
        if (transaction.amount <= 0) return 5
        if (this.pendingTransactions.find(e => e.fromAddress === transaction.fromAddress)) return 6
        if (transaction.minerFee > transaction.amount) return 7
        if (transaction.minerFee < 0) return 8
        if (await this.getBalanceOfAddress(transaction.fromAddress) < transaction.amount) return 9
        this.pendingTransactions.push(transaction)
        return 0
    }
    addBlock(block) {
        if (!this.chain.length) return this.chain.push(block)
        // find index of previous block in main chain
        const previousBlockIndex = this.chain.findIndex(e => e.height === block.height - 1)
        // if previous block in main chain does not exist
        if (previousBlockIndex !== -1) {
            const previousBlock = this.chain[previousBlockIndex]
            if (Blockchain.isPartOfChainValid([previousBlock, block])) {
                // if previousBlock is the last block in the fork
                if (previousBlockIndex === this.chain.length - 1) {
                    this.chain.push(block)
                }
                // block is in other index (create new fork)
                else {
                    this.forks.push([
                        previousBlock,
                        block
                    ])
                }
            }
        }
        else {
            let found = false
            for (const fork of this.forks) {
                // find index of previousBlock in fork
                const previousBlockIndex = fork.findIndex(e => e.height === block.height - 1)
                // if index of previous block
                if (previousBlockIndex === -1) continue
                // if block is valid in current fork
                const previousBlock = fork[previousBlockIndex]
                if (Blockchain.isPartOfChainValid([previousBlock, block])) {
                    // if previousBlock is the last block in the fork
                    if (previousBlockIndex === fork.length - 1) {
                        found = true
                        fork.push(block)
                    }
                    // block is in other index (create new fork)
                    else {
                        this.forks.push([
                            previousBlock,
                            block
                        ])
                    }
                }
            }
            // create new fork
            if (!found) {
                this.forks.push([
                    block
                ])
            }
        }
        this.updateDifficulty()
        return this.updateMainChain()
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
                        balance += transaction.amount - transaction.minerFee
                    }
                }
            }
            i++
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
            else if (blockTime > config.mining.blockTime && difficulty > 0) {
                difficulty--
            }
            if (blocks[2].difficulty !== difficulty) {
                // console.log('blocks[2].difficulty !== difficulty')
                return false
            }
        }
        return true
    }
    async isChainValid() {
        let i = 0,
        previousBlocks = []
        while (true) {
            let blocks = await load_blocks(config.limit.blocksPerQuery, i * config.limit.blocksPerQuery)
            if (!blocks.length) break
            if (previousBlocks) {
                blocks = [
                    ...previousBlocks,
                    ...blocks
                ]
            }
            previousBlocks = [
                blocks[blocks.length - 2],
                blocks[blocks.length - 1]
            ]
            if (!Blockchain.isPartOfChainValid(blocks)) return false
            i++
        }
        return true
    }
    async load_blocks(limit: number, skip: number) {
        if (limit > config.length.inMemoryChain) throw new Error('Cannot load more blocks than maxInMemoryChainLength!')
        if (skip < 0) skip = 0
        return await load_blocks(limit, skip)
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
            .exec()
        this.chain = await this.load_blocks(limit, chainLength - limit)
        this.updateDifficulty()
    }
    getChainWithMostWork() {
        const chains = [
            this.chain,
            ...this.forks
        ]
        chains.sort((a, b) => {
            return Blockchain.getWorkSumOfBlocks(b) - Blockchain.getWorkSumOfBlocks(a)
        })
        // chains.sort((a, b) => b[b.length - 1].height - a[a.length - 1].height)[0]
        const chain = chains[0]
        // console.log(chain[chain.length - 1].height)
        return chain
    }
    updateMainChain() {
        if (!this.chain.length) return false
        // console.log('forks', this.forks.length)
        const chain = this.getChainWithMostWork()
        if (chain[chain.length - 1].height > this.chain[this.chain.length - 1].height) {
            this.forks.push(this.chain)
            this.sortForksByHeight()
            this.popForks()
            this.chain = chain
            return true
        }
        return false
    }
    sortForksByHeight() {
        this.forks.sort((a, b) => b[b.length - 1].height - a[a.length - 1].height)
    }
    popForks() {
        while (this.forks.length > config.length.forks) this.forks.pop()
    }
    async saveTrustedBlock() {
        if (this.chain.length < config.mining.trustedLength) return
        const blockToSave = this.chain[this.chain.length - config.mining.trustedLength]
        const exists = await schema_block
            .exists({ height: blockToSave.height })
        if (exists) return false // console.log('did not save already saved block', blockToSave.height)
        blockToSave.save()
        return true // console.log('saved block', blockToSave.height)
    }
    static getWorkSumOfBlocks(blocks) {
        let work = 0
        for (const block of blocks) {
            work += Math.pow(2, block.difficulty)
        }
        return work
    }
    async getWork() {
        let i = 0, work = 0
        while (true) {
            const blocks = await schema_block
                .find({}, 'difficulty', { limit: config.limit.blocksPerQuery, skip: i * config.limit.blocksPerQuery })
                .exec()
            if (!blocks || !blocks.length) break
            for (const block of blocks) {
                work += Math.pow(2, block.difficulty)
            }
            i++
        }
        return work
    }
    updateDifficulty() {
        if (this.chain.length < 2) return
        const blocks = [
            this.getBlock(this.chain.length - 2),
            this.getBlock(this.chain.length - 1)
        ]
        this.difficulty = blocks[1].difficulty
        const blockTime = blocks[1].timestamp - blocks[0].timestamp
        if (blockTime < config.mining.blockTime && this.difficulty < 64) {
            this.difficulty++
        }
        else if (blockTime > config.mining.blockTime && this.difficulty > 0) {
            this.difficulty--
        }
        // console.log('updateDifficulty', this.difficulty)
    }
}
export default Blockchain