import * as events from 'events'
import Blockchain from './Blockchain'
import Block from './Block'
import Transaction from './Transaction'
import ClientNode from './ClientNode'
import * as config from '../../config.json'
interface Miner {
    blockchain: Blockchain
    walletAddress: string
    log: boolean
    mining: boolean
    clientNode: ClientNode
}
class Miner extends events.EventEmitter {
    constructor(wallet: string, log: boolean) {
        super()
        this.blockchain = new Blockchain()
        this.walletAddress = wallet
        this.log = log
        this.mining = false,
        this.clientNode = new ClientNode()
        this.clientNode.on('data', data => {
            if (!this.clientNode.verifyData(data)) return
            const processed = this.clientNode.processData(data)
            if (!processed) return
            console.log(processed.type)
            switch (processed.type) {
                case 'null':
                    break
                case 'block':
                    this.blockchain.addBlock(new Block(processed.data))
                    break
                case 'transaction':
                    this.blockchain.addTransaction(new Transaction(processed.data))
                    break
            }
        })
    }
    async start() {
        this.mining = true
        this.emit('mining', this.mining)
        await this.blockchain.loadLatestBlocks(config.length.inMemoryChain)
        while (this.mining) {
            const block = await this.minePendingTransactions()
            this.clientNode.broadcastAndStoreDataHash(Buffer.from(Buffer.alloc(1, ClientNode.getType('block')) + JSON.stringify(block)))
            if (this.log) console.log(block.height, block.hash)
        }
    }
    stop() {
        this.mining = false
        this.emit('mining', this.mining)
    }
    async minePendingTransactions() {
        const previousBlock = this.blockchain.getLatestBlock()
        if (previousBlock.previousHash === '') await this.mineBlock(previousBlock)
        const newBlockHeight = previousBlock.height + 1
        const transactions = [
            new Transaction({
                fromAddress: config.mining.reward.fromAddress,
                toAddress: this.walletAddress,
                amount: config.mining.reward.amount,
                blockHeight: newBlockHeight
            }),
            ...this.blockchain.pendingTransactions.sort((a, b) => (b.minerFee / Buffer.byteLength(JSON.stringify(b))) - (a.minerFee / Buffer.byteLength(JSON.stringify(a))))
        ]
        const block = new Block({
            timestamp: Date.now(),
            transactions,
            previousHash: previousBlock.hash,
            height: newBlockHeight
        })
        block.transactions.map(e => block.transactions[0].amount += e.minerFee)
        while (Buffer.byteLength(JSON.stringify(block)) > config.byteLength.block) {
            const transaction = block.transactions.pop()
            block.transactions[0].amount -= transaction.minerFee
        }
        await this.mineBlock(block)
        this.blockchain.pendingTransactions = []
        this.blockchain.chain.push(block)
        this.blockchain.shiftChain()
        return block
    }
    async mineBlock(block: Block) {
        while (this.mining, block.hash.substring(0, this.blockchain.difficulty) !== Array(this.blockchain.difficulty + 1).join('0')) {
            block.nonce++
            block.hash = block.calculateHash()
        }
        await block.save()
    }
}
export default Miner