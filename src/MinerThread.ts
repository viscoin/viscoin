import * as events from 'events'
import Block from './Block'
import Blockchain from './Blockchain'
import { parentPort } from 'worker_threads'

interface MinerThread {
    hashrate: number
    stop: boolean
    mining: boolean
    block: Block
    previousBlock: Block
}
class MinerThread extends events.EventEmitter {
    constructor() {
        super()
        this.mining = false
        this.hashrate = 0
        setInterval(() => {
            parentPort.postMessage(JSON.stringify({ e: 'hashrate', hashrate: this.hashrate }))
            this.hashrate = 0
        }, 1000)
        this.block = null
        this.previousBlock = null
        parentPort.on('message', e => {
            e = JSON.parse(e)
            switch (e.e) {
                case 'mine':
                    this.stop = false
                    this.block = new Block(Block.beautify(e.block))
                    this.previousBlock = new Block(Block.beautify(e.previousBlock))
                    if (this.mining === false) this.mine()
                    break
                case 'stop':
                    this.stop = true
                    break
            }
        })
    }
    async mine() {
        if (this.stop === true) return this.mining = false
        this.mining = true
        this.hashrate++
        const timestamp = Date.now()
        if (this.block.timestamp !== timestamp) {
            this.block.timestamp = timestamp
            const difficulty = Blockchain.getBlockDifficulty([ this.previousBlock, this.block ])
            if (this.block.difficulty !== difficulty) {
                this.block.difficulty = difficulty
            }
            this.block.setHeader()
        }
        if (await this.block.recalculateHash() === true) {
            this.stop = true
            parentPort.postMessage(JSON.stringify({ e: 'mined', block: this.block }))
        }
        this.mine()
    }
}
export default MinerThread