import * as configSettings from '../config/settings.json'
import * as configNetwork from '../config/network.json'
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
    mining: boolean
    previousBlock: Block
}
class Miner extends events.EventEmitter {
    constructor(miningRewardAddress: Buffer) {
        super()
        this.tcpClient = TCPApi.createClient()
        this.tcpClient.connect(configNetwork.TCPApi.port, configNetwork.TCPApi.host, true)
        this.tcpClient.on('block', () => this.start())
        this.tcpClient.on('transaction', () => this.start())
        this.workers = []
        this.threads = cpus().length
        if (configSettings.Miner.threads) this.threads = configSettings.Miner.threads
        this.threadsReady = 0
        this.hashrate = 0
        setInterval(() => {
            this.emit('hashrate', this.hashrate)
            this.hashrate = 0
            if (this.mining === false) this.start()
        }, 1000)
        this.miningRewardAddress = miningRewardAddress
        this.once('ready', () => this.start())
        this.setMaxListeners(configSettings.Miner.maxListeners)
        this.mining = false
        this.previousBlock = null
    }
    async start() {
        const block = await HTTPApi.getNewBlock({ host: configNetwork.HTTPApi.host, port: configNetwork.HTTPApi.port }, this.miningRewardAddress)
        if (block === null) return setTimeout(() => this.start(), configSettings.HTTPApi.autoRetry)
        if (this.previousBlock === null
        || this.previousBlock.hash?.equals(block.previousHash) === false) this.previousBlock = await HTTPApi.getLatestBlock({ host: configNetwork.HTTPApi.host, port: configNetwork.HTTPApi.port })
        if (this.previousBlock === null
        || this.previousBlock.hash?.equals(block.previousHash) === false) return setTimeout(() => this.start(), configSettings.HTTPApi.autoRetry)
        this.emitThreadsMineNewBlock(block, this.previousBlock)
    }
    emitThreadsMineNewBlock(block: Block, previousBlock: Block) {
        this.mining = true
        for (const worker of this.workers) {
            worker.postMessage(JSON.stringify({ e: 'mine', block: Block.minify(block), previousBlock: Block.minify(previousBlock), threads: this.threads }))
        }
    }
    emitThreadsStop() {
        for (const worker of this.workers) {
            worker.postMessage(JSON.stringify({ e: 'stop' }))
        }
        this.mining = false
    }
    async postBlock(block: Block) {
        try {
            const code = await HTTPApi.postBlock({ host: configNetwork.HTTPApi.host, port: configNetwork.HTTPApi.port }, block)
            this.emit('mined', block, code)
            if (code !== 0) await this.start()
        }
        catch {
            setTimeout(() => this.postBlock(block), configSettings.HTTPApi.autoRetry)
        }
    }
    addWorker(worker: Worker) {
        this.workers.push(worker)
        worker.on('message', e => {
            e = JSON.parse(e)
            switch (e.e) {
                case 'ready':
                    if (++this.threadsReady === this.threads) this.emit('ready')
                    this.emit('thread', e.threadId)
                    break
                case 'mined':
                    this.emitThreadsStop()
                    this.postBlock(new Block(e.block))
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