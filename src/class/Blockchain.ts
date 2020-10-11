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
        this.difficulty = config.difficulty
        this.pendingTransactions = []
        this.chain = []
    }
    createGenesisBlock() {
        return new Block({
            timestamp: Date.now(),
            transactions: [],
            previousHash: ''
        })
    }
    getLatestBlock() {
        const block = this.chain[this.chain.length - 1]
        if (block) return block
        else return this.createGenesisBlock()
    }
    async minePendingTransactions(miningRewardAddress) {
        const transactions = [
            new Transaction({
                fromAddress: config.mining_reward_address,
                toAddress: miningRewardAddress,
                amount: config.miningReward
            }),
            ...this.pendingTransactions.sort((a, b) => (b.minerFee / JSON.stringify(b).length) - (a.minerFee / JSON.stringify(a).length))
        ]
        while (JSON.stringify(transactions).length > config.blockSize) {
            transactions.pop()
        }
        transactions.map(e => transactions[0].amount += e.minerFee)
        // console.log(transactions)
        const previousBlock = this.getLatestBlock()
        if (previousBlock.previousHash === '') await previousBlock.mineBlock(this.difficulty)
        const block = new Block({
            timestamp: Date.now(),
            transactions,
            previousHash: previousBlock.hash
        })
        await block.mineBlock(this.difficulty)
        this.pendingTransactions = []
        this.chain.push(block)
        this.shiftChain()
    }
    shiftChain() {
        while (this.chain.length > config.maxInMemoryChainLength) this.chain.shift()
    }
    addTransaction(transaction) {
        if (!transaction.fromAddress || !transaction.toAddress) {
            throw new Error('Transaction must include from and to address!')
        }
        if (!transaction.isValid()) {
            throw new Error('Cannot add invalid transaction to the chain!')
        }
        if (transaction.amount <= 0) {
            throw new Error('Transaction amount must be higher than 0!')
        }
        if (this.getBalanceOfAddress(transaction.fromAddress) < transaction.amount) {
            throw new Error('Not enough balance!')
        }
        if (this.pendingTransactions.find(e => e.fromAddress === transaction.fromAddress)) {
            throw new Error('Already have a pending transaction!')
        }
        if (transaction.minerFee > transaction.amount) {
            throw new Error('Fee is larger than transaction amount!')
        }
        if (transaction.minerFee < 0) {
            throw new Error('Fee must not be a negative number!')
        }
        this.pendingTransactions.push(transaction)
    }
    async getBalanceOfAddress(address) {
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
                }, 'transactions', { limit: config.blocksPerQueryLimit, skip: i * config.blocksPerQueryLimit })
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
    isChainValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i]
            const previousBlock = this.chain[i - 1]
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
    async load_blocks(limit: number, skip: number) {
        if (limit > config.maxInMemoryChainLength) throw new Error('Cannot load more blocks than maxInMemoryChainLength!')
        this.chain = await load_blocks(limit, skip)
        // this.chain.push(...await load_blocks(limit, skip))
        // this.chain = [
        //     ...await load_blocks(limit, skip),
        //     ...this.chain
        // ]
        // this.shiftChain()
    }
}
export default Blockchain