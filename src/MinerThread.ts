import * as events from 'events'
import Block from './Block'
import Blockchain from './Blockchain'
interface MinerThread {
    threads: number
    hashrate: number
    paused: boolean
}
class MinerThread extends events.EventEmitter {
    constructor() {
        super()
        this.hashrate = 0
        this.paused = true
        setInterval(() => {
            this.emit('hashrate', this.hashrate)
            this.hashrate = 0
        }, 1000)
        this.on('mine', async (block, previousBlock, threads) => {
            this.threads = threads
            if (this.paused === true) {
                this.paused = false
                await this.mine(new Block(block), new Block(previousBlock))
            }
        })
        this.on('pause', () => this.paused = true)
    }
    async mine(block: Block, previousBlock: Block) {
        if (this.paused === true) return
        this.hashrate++
        if (block.timestamp !== Date.now()) {
            block.timestamp = Date.now()
            const difficulty = Blockchain.getBlockDifficulty([ previousBlock, block ])
            if (block.difficulty !== difficulty) {
                block.difficulty = difficulty
                block.nonce %= this.threads
            }
        }
        if (await block.recalculateHash(this.threads) === true) {
            this.paused = true
            return this.emit('mined', block)
        }
        await this.mine(block, previousBlock)
    }
}
export default MinerThread