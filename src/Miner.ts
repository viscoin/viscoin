import * as events from 'events'
import Block from './Block'
interface Miner {
    threads: number
    immediate: NodeJS.Immediate
    hashrate: number
}
class Miner extends events.EventEmitter {
    constructor() {
        super()
        this.hashrate = 0
        setInterval(() => {
            this.emit('hashrate', this.hashrate)
            this.hashrate = 0
        }, 1000)
        this.on('mine', (block, threads) => {
            this.threads = threads
            this.loop(new Block(block))
        })
        this.on('pause', () => clearImmediate(this.immediate))
    }
    loop(block) {
        clearImmediate(this.immediate)
        this.immediate = setImmediate(() => this.mine(block))
    }
    async mine(block: Block) {
        const found = await block.recalculateHash(this.threads)
        if (found) this.emit('mined', block)
        else this.loop(block)
        this.hashrate++
    }
}
export default Miner