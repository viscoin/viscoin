import * as config from '../config.json'
import * as chalk from 'chalk'
import BaseClient from "./BaseClient"
import Block from './Block'
import protocol from './protocol'
import { Worker } from 'worker_threads'
import { cpus } from 'os'
interface MinerClient {
    workers: Array<Worker>
    threads: number
    threadsReady: number
    hashrate: number
}
class MinerClient extends BaseClient {
    constructor() {
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
    }
    async mineNewBlock() {
        const block = await this.blockchain.getNewBlock('address')
        for (const worker of this.workers) {
            worker.postMessage(JSON.stringify({ code: 'mine', block }))
        }
    }
}
export default MinerClient