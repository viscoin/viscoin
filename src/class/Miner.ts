import Blockchain from './Blockchain'
import Block from './Block'
import Transaction from './Transaction'
import ClientNode from './ClientNode'
import * as config from '../../config.json'
import FullNode from './FullNode'
interface Miner {
    walletAddress: string
}
class Miner extends FullNode {
    constructor(wallet: string) {
        super()
        this.walletAddress = wallet
        this.on('block', (block, forked) => {
            this.stop()
            this.start()
        })
        this.on('transaction', (transaction, code) => {
            this.stop()
            this.start()
        })
    }
    start() {
        this.mine(this.getNewBlock())
    }
    stop() {
        clearImmediate(this.intermediate)
    }
    mine(block: Block) {
        const found = block.recalculateHash()
        if (found) {
            this.emit('hash', found, block)
            this.blockchain.pendingTransactions = []
            this.blockchain.chain.push(block)
            this.blockchain.shiftChain()
            this.broadcastAndStoreDataHash(Buffer.from(Buffer.alloc(1, ClientNode.getType('block')) + JSON.stringify(block)))
            this.blockchain.saveTrustedBlock()
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
            this.emit('hash', found)
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