import * as events from 'events'
import Block from './Block'
interface Miner {
    threads: number
    hashrate: number
    paused: boolean
}
class Miner extends events.EventEmitter {
    constructor() {
        super()
        this.hashrate = 0
        this.paused = true
        setInterval(() => {
            this.emit('hashrate', this.hashrate)
            this.hashrate = 0
        }, 1000)
        this.on('mine', async (block, threads) => {
            this.threads = threads
            if (this.paused === true) {
                this.paused = false
                await this.mine(new Block(block))
            }
        })
        this.on('pause', () => this.paused = true)
    }
    async mine(block: Block) {
        if (this.paused === true) return
        this.hashrate++
        if (await block.recalculateHash(this.threads) === true) {
            this.paused = true
            return this.emit('mined', block)
        }
        await this.mine(block)
    }
}
export default Miner