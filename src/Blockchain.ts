import * as crypto from 'crypto'
import * as config from '../config.json'
import Transaction from './Transaction'
import Block from './Block'
import schema_block from './mongoose/schema/block'
import base58 from './base58'
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
        const block = await Block.load(null, null, { sort: { height: -1, difficulty: -1 } })
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
            if (typeof transaction.amount !== 'number') return 5
            if (transaction.amount <= 0) return 6
            // if (transaction.amount.toString() !== transaction.amount.toFixed(6)) return 6.5
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
        if (typeof transaction.minerFee !== 'number') return 15
        if (transaction.minerFee < 0) return 16
        // if (transaction.minerFee.toString() !== transaction.minerFee.toFixed(6)) return 16.5
        // recoveryParam
        if (typeof transaction.recoveryParam !== 'number') return 17
        if (transaction.recoveryParam >> 2) return 18
        // verify
        if (this.pendingTransactions.find(e => e.calculateHash().equals(transaction.calculateHash()))) return 19
        if (!transaction.verify()) return 20
        // async
        if (transaction.timestamp < (await this.getLatestBlock()).timestamp) return 21
        let sum = transaction.minerFee
        if (transaction.amount) sum += transaction.amount
        if (await this.getBalanceOfAddress(transaction.from) < sum) return 22
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
        // async
        if (block.height < await this.getHeight() - config.mining.trustedAfterBlocks) return 11
        // !
        // const previousBlock = await Block.load({ hash: block.previousHash, height: block.height - 1 })
        const previousBlock = await Block.load({ hash: block.previousHash })
        if (previousBlock) {
            const valid = Blockchain.isPartOfChainValid([
                previousBlock,
                block
            ])
            if (valid === false) return 12
        }
        if (await Block.exists({ hash: block.hash })) return 13
        await block.save()
        await this.cleanLastTrustedChain()
        return 0
    }
    async getTransactionsOfAddress(address: Buffer) {
        const transactions = []
        let block = await this.getLatestBlock()
        while (true) {
            if (!block) break
            for (const transaction of block.transactions) {
                if ((transaction.from && address.equals(transaction.from))
                    || (transaction.to && address.equals(transaction.to))) transactions.push(transaction)
            }
            block = await Block.load({ hash: block.previousHash })
        }
        return transactions
    }
    async getBalanceOfAddress(address: Buffer) {
        const transactions = await this.getTransactionsOfAddress(address)
        let balance = 0
        for (const transaction of transactions) {
            if (transaction.from && address.equals(transaction.from)) {
                if (transaction.amount) balance -= transaction.amount + transaction.minerFee
                else balance -= transaction.minerFee
            }
            if (transaction.to && address.equals(transaction.to)) {
                balance += transaction.amount
            }
        }
        return balance
    }
    static isPartOfChainValid(chain: Array<Block>) {
        // i = 2
        for (let i = 1; i < chain.length; i++) {
            const currentBlock = chain[i]
            const previousBlock = chain[i - 1]
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
            let difficulty = blocks[1].difficulty
            const blockTime = blocks[1].timestamp - blocks[0].timestamp
            if (blockTime < config.mining.blockTime && difficulty < 64) difficulty++
            else if (blockTime >= config.mining.blockTime && difficulty > 0) difficulty--
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
                block = await Block.load({ hash: block.previousHash })
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
    async isLastTrustedChainValid() {
        let block = await this.getLatestBlock()
        let previousBlocks = []
        let blocks = []
        let counter = 0
        while (true) {
            for (let i = 0; i < 2; i++) {
                if (!block) break
                block = await Block.load({ hash: block.previousHash })
                if (!block) break
                blocks.unshift(block)
                counter++
            }
            if (!blocks.length) break
            blocks = [
                ...blocks,
                ...previousBlocks
            ]
            // return object with info about invalidity
            if (!Blockchain.isPartOfChainValid(blocks)) return false
            if (counter >= config.mining.trustedAfterBlocks) break
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
    async cleanChain() {
        if (!await this.isChainValid()) await this.repairChain()
        let block = await this.getLatestBlock()
        if (!block) return
        const height = block.height, hashes = []
        while (true) {
            block = await Block.load({ hash: block.previousHash })
            if (!block) break
            if (block.height <= height) hashes.push(block.hash)
        }
        if (!hashes.length) return
        const info = await schema_block
            .deleteMany({
                hash: {
                    $not: {
                        $in: hashes
                    }
                },
                height: {
                    $lte: height - config.mining.trustedAfterBlocks
                }
            })
            .exec()
        // console.log(info)
        return info
    }
    async cleanLastTrustedChain() {
        if (!await this.isLastTrustedChainValid()) await this.repairChain()
        let block = await this.getLatestBlock()
        if (!block) return
        let i = 0
        while (true) {
            block = await Block.load({ hash: block.previousHash })
            if (!block) break
            if (i++ === config.mining.trustedAfterBlocks) break
            // if (i++ <= config.mining.trustedAfterBlocks) break
        }
        if (!block) return
        const info = await schema_block
            .deleteMany({
                hash: {
                    $ne: block.hash
                },
                height: block.height
            })
            .exec()
        // console.log(info)
        return info
    }
    async repairChain() {
        // delete whole invalid chain
        let block = await this.getLatestBlock()
        let previousBlocks = []
        let blocks = []
        const hashes = []
        while (true) {
            for (let i = 0; i < 2; i++) {
                if (!block) break
                block = await Block.load({ hash: block.previousHash })
                if (!block) break
                blocks.unshift(block)
                hashes.push(block.hash)
            }
            if (!blocks.length) break
            blocks = [
                ...blocks,
                ...previousBlocks
            ]
            if (!Blockchain.isPartOfChainValid(blocks)) {
                const info = await schema_block
                    .deleteMany({
                        hash: {
                            $in: hashes
                        }
                    })
                    .exec()
                // console.log('repairChain', info)
                return info
            }
            previousBlocks = [
                blocks[0],
                blocks[1]
            ]
            blocks = []
        }
    }
    // !
    async getBlockByHeight(height: number) {
        let block = await this.getLatestBlock()
        // !
        while (true) {
            if (!block) break
            block = await Block.load({ hash: block.previousHash })
            if (!block || block.height === height) break
        }
        if (!block || block.height !== height) return null
        return block
    }
    // async repairChain() {
    //     // delete one block from invalid chain at a time
    //     if (await this.isChainValid()) return
    //     let block = await this.getLatestBlock()
    //     const latestBlock = block
    //     let previousBlocks = []
    //     let blocks = []
    //     while (true) {
    //         for (let i = 0; i < 2; i++) {
    //             if (!block) break
    //             block = await Block.load({ hash: block.previousHash })
    //             if (!block) break
    //             blocks.unshift(block)
    //         }
    //         if (!blocks.length) break
    //         blocks = [
    //             ...blocks,
    //             ...previousBlocks
    //         ]
    //         if (!Blockchain.isPartOfChainValid(blocks)) {
    //             const info = await schema_block
    //                 .deleteOne({
    //                     hash: latestBlock.hash
    //                 })
    //                 .exec()
    //             console.log('repairChain', info)
    //             return await this.repairChain()
    //         }
    //         previousBlocks = [
    //             blocks[0],
    //             blocks[1]
    //         ]
    //         blocks = []
    //     }
    // }

    // !
    // calling this function when pendingtransactions is full and the transaction does not get added will result in people being able to abuse the miner by keeping sending transaction with 0 mining reward
    // resetting the miners nonce resulting in miner being stuck without being able to reach the nonce where it mines block
    async getNewBlock(address: Buffer) {
        const previousBlock = await this.getLatestBlock()
        if (previousBlock.height === 0) await previousBlock.save()
        const transactions = [
            new Transaction({
                to: address,
                amount: config.mining.reward
            }),
            ...this.pendingTransactions
                .filter(e => e.timestamp >= previousBlock.timestamp)
                .sort((a, b) => (b.minerFee / Buffer.byteLength(JSON.stringify(b))) - (a.minerFee / Buffer.byteLength(JSON.stringify(a))))
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
            block.transactions[0].amount += block.transactions[i].minerFee
        }
        while (Buffer.byteLength(JSON.stringify(block)) > config.mining.blockSize) {
            const transaction = block.transactions.pop()
            block.transactions[0].amount -= transaction.minerFee
        }
        return block
    }
    async getNextSyncBlock() {
        const block = await this.getBlockByHeight(this.syncIndex++)
        if (this.syncIndex >= await this.getHeight() - config.mining.trustedAfterBlocks) this.syncIndex = 0
        return block
    }
    async getCircumlatingSupply() {
        return await this.getHeight() * config.mining.reward
    }
    async getTotalTransactions(timestamp: number | null = null) {
        let block = await this.getLatestBlock(),
        transactions = 0
        while (block && (timestamp === null || timestamp <= block.timestamp)) {
            transactions += block.transactions.length
            block = await Block.load({ hash: block.previousHash })
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