import * as crypto from 'crypto'
import * as config from '../config.json'
import Transaction from './Transaction'
import Block from './Block'
import schema_block from './mongoose/schema/block'
import base58 from './base58'
import protocol from './protocol'
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
        if (typeof transaction.fromAddress !== 'string') return 1
        if (typeof transaction.toAddress !== 'string') return 2
        if (typeof transaction.timestamp !== 'number') return 3
        if (typeof transaction.amount !== 'number') return 4
        if (typeof transaction.minerFee !== 'number') return 5
        if (typeof transaction.signature !== 'object') return 6
        if (transaction.signature instanceof Buffer === false) return 7
        if (transaction.amount <= 0) return 8
        if (transaction.minerFee < 0) return 9
        if (transaction.minerFee > transaction.amount) return 10
        if (transaction.timestamp > Date.now()) return 11
        if (this.pendingTransactions.find(e => e.calculateHash().equals(transaction.calculateHash()))) return 12
        try {
            crypto.createPublicKey({
                key: base58.decode(transaction.toAddress),
                type: 'spki',
                format: 'der'
            })
        } catch {
            return 13
        }
        if (!transaction.verify()) return 14
        // async
        if (transaction.timestamp < (await this.getLatestBlock()).timestamp) return 15
        if (await this.getBalanceOfAddress(transaction.fromAddress) < transaction.amount) return 16
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
        if (typeof block.transactions !== 'object') return 7
        if (block.hash instanceof Buffer === false) return 8
        if (block.previousHash instanceof Buffer === false) return 9
        if (Array.isArray(block.transactions) === false) return 10
        if (block.timestamp > Date.now()) return 11
        // async
        if (block.height < (await this.getLatestBlock()).height - config.mining.trustedAfterBlocks) {
            const _block = await Block.load({ height: block.height })
            if (_block && _block.difficulty < block.difficulty) return 12
        }
        const previousBlock = await Block.load({ hash: block.previousHash, height: block.height - 1 })
        if (previousBlock) {
            const valid = Blockchain.isPartOfChainValid([
                previousBlock,
                block
            ])
            if (valid === false) return 13
        }
        if (await Block.exists({ hash: block.hash })) return 14
        await block.save()
        await this.cleanLastTrustedChain()
        return 0
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
    async getBlockByHeight(height: number) {
        let block = await this.getLatestBlock()
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
    async getNewBlock(walletAddress) {
        const previousBlock = await this.getLatestBlock()
        if (previousBlock.height === 0) await previousBlock.save()
        const transactions = [
            new Transaction({
                fromAddress: config.mining.reward.fromAddress,
                toAddress: walletAddress,
                amount: config.mining.reward.amount
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
        block.transactions.map(e => block.transactions[0].amount += e.minerFee)
        while (Buffer.byteLength(JSON.stringify(block)) > config.mining.blockSize) {
            const transaction = block.transactions.pop()
            block.transactions[0].amount -= transaction.minerFee
        }
        return block
    }
    async getNextSyncBlock() {
        const block = await this.getBlockByHeight(this.syncIndex++)
        if (this.syncIndex >= (await this.getLatestBlock()).height - config.mining.trustedAfterBlocks) this.syncIndex = 0
        return block
    }
}
export default Blockchain