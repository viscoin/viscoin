import Blockchain from './Blockchain'
import Block from './Block'
import Transaction from './Transaction'
import ClientNode from './ClientNode'
import * as config from '../../config.json'
import FullNode from './FullNode'
interface Miner {
    walletAddress: string
    mining: boolean
}
class Miner extends FullNode {
    constructor(wallet: string) {
        super()
        this.walletAddress = wallet
        this.mining = false
        this.on('block', (block, forked) => {
            this.restart()
        })
        this.on('transaction', (transaction, code) => {
            this.restart()
        })
    }
    start() {
        this._start(true)
    }
    stop() {
        this._stop(true)
    }
    _start(force: boolean) {
        if (force) this.mining = true
        if (this.mining) this.mine(this.getNewBlock())
    }
    _stop(force: boolean) {
        if (force) this.mining = false
        clearImmediate(this.intermediate)
    }
    restart() {
        this._stop(false)
        this._start(false)
    }
    mine(block: Block) {
        const found = block.recalculateHash()
        if (found) {
            this.emit('hash', found, block)
            this.blockchain.pendingTransactions = []
            this.blockchain.chain.push(block)
            this.blockchain.updateDifficulty()
            // this.blockchain.addBlock(block)
            this.blockchain.shiftChain()
            this.broadcastAndStoreDataHash(Buffer.from(Buffer.alloc(1, ClientNode.getType('block')) + JSON.stringify(block)))
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
        if (previousBlock.height === 0) this.broadcastAndStoreDataHash(Buffer.from(Buffer.alloc(1, ClientNode.getType('block')) + JSON.stringify(previousBlock)))
        const transactions = [
            new Transaction({
                fromAddress: config.mining.reward.fromAddress,
                toAddress: this.walletAddress,
                amount: config.mining.reward.amount
            }),
            ...this.blockchain.pendingTransactions
                .filter(e => e.timestamp >= previousBlock.timestamp)
                .sort((a, b) => (b.minerFee / Buffer.byteLength(JSON.stringify(b))) - (a.minerFee / Buffer.byteLength(JSON.stringify(a))))
        ]
        const block = new Block({
            transactions,
            previousHash: previousBlock.hash,
            height: previousBlock.height + 1,
            difficulty: this.blockchain.difficulty
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