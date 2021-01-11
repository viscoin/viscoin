import * as config from '../config.json'
import Block from './Block'
import { Worker } from 'worker_threads'
import { cpus } from 'os'
import * as events from 'events'
import HTTPApi from './HTTPApi'
import TCPApi from './TCPApi'

interface Miner {
    workers: Array<Worker>
    threads: number
    threadsReady: number
    hashrate: number
    miningRewardAddress: Buffer
    tcpClient: TCPApi['Client']
}
class Miner extends events.EventEmitter {
    constructor(miningRewardAddress: Buffer) {
        super()
        this.tcpClient = TCPApi.createClient()
        if (config.TCPApi.enabled) {
            this.tcpClient.connect(config.TCPApi.port, config.TCPApi.host, true)
            this.tcpClient.on('block', async () => {
                this.emitThreadsPause()
                await this.start()
            })
            this.tcpClient.on('transaction', async (tsx) => {
                this.emitThreadsPause()
                await this.start()
            })
        }
        this.workers = []
        this.threads = cpus().length
        if (config.Miner.threads) this.threads = config.Miner.threads
        this.threadsReady = 0
        this.hashrate = 0
        setInterval(() => {
            this.emit('hashrate', this.hashrate)
            this.hashrate = 0
        }, 1000)
        this.miningRewardAddress = miningRewardAddress
        this.once('ready', async () => await this.start())
    }
    async start() {
        const block = await this.getNewBlock()
        if (block === null) return setTimeout(async () => {
            await this.start()
        }, config.HTTPApi.autoRetry)
        this.emitThreadsMineNewBlock(block)
    }
    emitThreadsMineNewBlock(block: Block) {
        for (const worker of this.workers) {
            worker.postMessage(JSON.stringify({ code: 'mine', block, threads: this.threads }))
        }
    }
    emitThreadsPause() {
        for (const worker of this.workers) {
            worker.postMessage(JSON.stringify({ code: 'pause' }))
        }
    }
    async getNewBlock() {
        try {
            return await HTTPApi.getNewBlock(this.miningRewardAddress)
        }
        catch {
            return null
        }
    }
    async postBlock(block: Block) {
        try {
            const code = await HTTPApi.postBlock(block)
            this.emit('mined', block, code)
        }
        catch {
            setTimeout(async () => {
                await this.postBlock(block)
            }, config.HTTPApi.autoRetry)
        }
    }
    addWorker(worker: Worker) {
        this.workers.push(worker)
        worker.on('message', async e => {
            e = JSON.parse(e)
            switch (e.code) {
                case 'ready':
                    if (++this.threadsReady === this.threads) this.emit('ready')
                    break
                case 'mined':
                    this.emitThreadsPause()
                    await this.postBlock(new Block(e.block))
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
export default Miner