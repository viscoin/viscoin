import * as events from 'events'
import Block from './Block'
import Blockchain from './Blockchain'
import { parentPort, threadId } from 'worker_threads'
import toLocaleTimeString from './chalk/LocaleTimeString'
import * as chalk from 'chalk'

interface MinerThread {
    threads: number
    hashrate: number
    paused: boolean
}
class MinerThread extends events.EventEmitter {
    constructor() {
        super()
        this.paused = true
        this.hashrate = 0
        setInterval(() => {
            parentPort.postMessage(JSON.stringify({ e: 'hashrate', hashrate: this.hashrate }))
            this.hashrate = 0
        }, 1000)
        parentPort.on('message', async e => {
            e = JSON.parse(e)
            switch (e.e) {
                case 'mine':
                    if (this.paused === false) return
                    this.paused = false
                    e.block.nonce = threadId
                    this.threads = e.threads
                    await this.mine(new Block(e.block), new Block(e.previousBlock))
                    break
                case 'pause':
                    this.paused = true
                    break
            }
        })
        parentPort.postMessage(JSON.stringify({ e: 'ready' }))
        console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Forking miner')} { threadId: ${chalk.yellowBright(threadId)} }`)
    }
    async mine(block: Block, previousBlock: Block) {
        if (this.paused === true) return
        this.hashrate++
        if (block.timestamp !== Date.now()) {
            block.timestamp = Date.now()
            block.nonce %= this.threads
            const difficulty = Blockchain.getBlockDifficulty([ previousBlock, block ])
            if (block.difficulty !== difficulty) {
                block.difficulty = difficulty
            }
            block.setHeader()
        }
        if (await block.recalculateHash(this.threads) === true) {
            this.paused = true
            return parentPort.postMessage(JSON.stringify({ e: 'mined', block }))
        }
        await this.mine(block, previousBlock)
    }
}
export default MinerThread