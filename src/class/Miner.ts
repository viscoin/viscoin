import Blockchain from './Blockchain'
import Block from './Block'
import Transaction from './Transaction'
import ClientNode from './ClientNode'
import * as config from '../../config.json'
interface Miner {
    blockchain: Blockchain
    walletAddress: string
    log: boolean
    clientNode: ClientNode
    intermediate: NodeJS.Immediate
}
class Miner {
    constructor(wallet: string, log: boolean) {
        this.blockchain = new Blockchain()
        this.walletAddress = wallet
        this.log = log
        this.clientNode = new ClientNode()
        this.clientNode.on('data', async data => {
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
                    const code = await this.blockchain.addTransaction(new Transaction(processed.data))
                    if (code) return console.log(`code: ${code}`)
                    this.stop()
                    this.start()
                    break
            }
        })
    }
    async load() {
        await this.blockchain.loadLatestBlocks(config.length.inMemoryChain)
    }
    start() {
        this.mine(this.getNewBlock())
    }
    stop() {
        clearImmediate(this.intermediate)
    }
    mine(block) {
        const found = block.recalculateHash(this.blockchain.difficulty)
        if (found) {
            this.blockchain.pendingTransactions = []
            this.blockchain.chain.push(block)
            this.blockchain.shiftChain()
            this.clientNode.broadcastAndStoreDataHash(Buffer.from(Buffer.alloc(1, ClientNode.getType('block')) + JSON.stringify(block)))
            if (this.log) console.log(block.height, block.hash)
            block.save()
            if (config.use.process.nextTick) {
                process.nextTick(() => {
                    this.intermediate = setImmediate(() => {
                        this.mine(this.getNewBlock())
                    })
                })
            }
            else {
                this.intermediate = setImmediate(() => {
                    this.mine(this.getNewBlock())
                })
            }
        }
        else {
            if (config.use.process.nextTick) {
                process.nextTick(() => {
                    this.intermediate = setImmediate(() => {
                        this.mine(block)
                    })
                })
            }
            else {
                this.intermediate = setImmediate(() => {
                    this.mine(block)
                })
            }
        }
    }
    getNewBlock() {
        const previousBlock = this.blockchain.getLatestBlock()
        if (previousBlock.previousHash === '') previousBlock.save()
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
        return block
    }
}
export default Miner