import * as config from '../config.json'
import * as chalk from 'chalk'
import BaseClient from "./BaseClient"
import protocol from './protocol'
import Block from './Block'
import { Worker } from 'worker_threads'
import { cpus } from 'os'
interface MinerClient {
    workers: Array<Worker>
    threads: number
    threadsReady: number
    hashrate: number
    miningRewardAddress: string
}
class MinerClient extends BaseClient {
    constructor(miningRewardAddress: string) {
        super()
        this.workers = []
        this.threads = cpus().length
        if (config.threads) this.threads = config.threads
        this.threadsReady = 0
        this.hashrate = 0
        setInterval(() => {
            console.log(`${chalk.magentaBright('Hashrate')}: ${chalk.yellowBright(this.hashrate)} ${chalk.redBright('H/s')}`)
            this.hashrate = 0
        }, 1000)
        this.miningRewardAddress = miningRewardAddress
    }
    async mineNewBlock() {
        const block = await this.blockchain.getNewBlock(this.miningRewardAddress)
        for (const worker of this.workers) {
            worker.postMessage(JSON.stringify({ code: 'mine', block }))
        }
    }
    addWorker(worker: Worker) {
        this.workers.push(worker)
        worker.on('message', async e => {
            e = JSON.parse(e)
            switch (e.code) {
                case 'ready':
                    if (++this.threadsReady === this.threads) await this.mineNewBlock()
                    break
                case 'mined':
                    console.log('mined', e.block.height)
                    await this.blockchain.addBlock(new Block(e.block))
                    this.blockchain.pendingTransactions = []
                    this.node.broadcastAndStoreDataHash(protocol.constructDataBuffer('block', e.block))
                    await this.mineNewBlock()
                    break
                case 'hashrate':
                    this.hashrate += e.hashrate
                    break
            }
        })
        worker.on('error', e => console.log('error', e))
        worker.on('exit', e => console.log('exit', e))
        worker.on('messageerror', e => console.log('messageerror', e))
        // worker.on('online', e => console.log('online', e))
    }
}
export default MinerClient