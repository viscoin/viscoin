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
class Miner {
    constructor(wallet: string, log: boolean) {
        this.blockchain = new Blockchain()
        this.walletAddress = wallet
        this.log = log
        this.mining = false,
        this.clientNode = new ClientNode()
    }
    async start() {
        this.mining = true
        await this.blockchain.loadLatestBlocks(config.length.inMemoryChain)
        while (this.mining) {
            const block = await this.minePendingTransactions()
            this.clientNode.broadcast(Buffer.from(Buffer.alloc(1, ClientNode.getType('block')) + JSON.stringify(block)))
            if (this.log) console.log(block.height, block.hash)
        }
    }
    stop() {
        this.mining = false
    }
    async minePendingTransactions() {
        const previousBlock = this.blockchain.getLatestBlock()
        if (previousBlock.previousHash === '') await previousBlock.mineBlock(this.blockchain.difficulty)
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
        await block.mineBlock(this.blockchain.difficulty)
        this.blockchain.pendingTransactions = []
        this.blockchain.chain.push(block)
        this.blockchain.shiftChain()
        return block
    }
}
export default Miner