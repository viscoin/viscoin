import * as config_settings from '../config/settings.json'
import Block from './Block'
import { Worker } from 'worker_threads'
import { cpus } from 'os'
import * as events from 'events'
import HTTPApi from './HTTPApi'
import TCPApi from './TCPApi'
import log from './log'
import * as config_default_env from '../config/default_env.json'

interface Miner {
    HTTP_API: {
        host: string
        port: number
    }
    TCP_API: {
        host: string
        port: number
    }
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
        const TCP_API = process.env.TCP_API || config_default_env.TCP_API
        this.TCP_API = {
            host: TCP_API.split(':').slice(0, -1).join(':'),
            port: parseInt(TCP_API.split(':').reverse()[0])
        }
        if (process.env.TCP_API) log.info('Using TCP_API:', this.TCP_API)
        else log.warn('Unset environment value! Using default value for TCP_API:', this.TCP_API)
        const HTTP_API = process.env.HTTP_API || config_default_env.HTTP_API
        this.HTTP_API = {
            host: HTTP_API.split(':').slice(0, -1).join(':'),
            port: parseInt(HTTP_API.split(':').reverse()[0])
        }
        if (process.env.HTTP_API) log.info('Using HTTP_API:', this.HTTP_API)
        else log.warn('Unset environment value! Using default value for HTTP_API:', this.HTTP_API)
        this.tcpClient = TCPApi.createClient()
        this.tcpClient.connect(this.TCP_API.port, this.TCP_API.host, true)
        this.tcpClient.on('block', () => this.start())
        this.tcpClient.on('transaction', () => this.start())
        this.workers = []
        this.threads = cpus().length
        if (config_settings.Miner.threads) this.threads = config_settings.Miner.threads
        this.threadsReady = 0
        this.hashrate = 0
        setInterval(() => {
            log.debug(1, 'Hashrate', this.hashrate)
            this.hashrate = 0
            if (this.mining === false) this.start()
        }, 1000)
        this.miningRewardAddress = miningRewardAddress
        this.setMaxListeners(config_settings.Miner.maxListeners)
        this.mining = false
        this.previousBlock = null
    }
    async start() {
        const block = await HTTPApi.getNewBlock({ host: this.HTTP_API.host, port: this.HTTP_API.port }, this.miningRewardAddress)
        if (block === null) return setTimeout(() => this.start(), config_settings.HTTPApi.autoRetry)
        if (this.previousBlock === null
        || this.previousBlock.hash?.equals(block.previousHash) === false) this.previousBlock = await HTTPApi.getLatestBlock({ host: this.HTTP_API.host, port: this.HTTP_API.port })
        if (this.previousBlock === null
        || this.previousBlock.hash?.equals(block.previousHash) === false) return setTimeout(() => this.start(), config_settings.HTTPApi.autoRetry)
        this.emitThreadsMineNewBlock(block, this.previousBlock)
    }
    emitThreadsMineNewBlock(block: Block, previousBlock: Block) {
        this.mining = true
        for (const worker of this.workers) {
            worker.postMessage(JSON.stringify({ e: 'mine', block: Block.minify(block), previousBlock: Block.minify(previousBlock) }))
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
            const code = await HTTPApi.postBlock({ host: this.HTTP_API.host, port: this.HTTP_API.port }, block)
            log.debug(1, 'Mined', code, block)
            if (code !== 0) await this.start()
        }
        catch {
            setTimeout(() => this.postBlock(block), config_settings.HTTPApi.autoRetry)
        }
    }
    addWorker(worker: Worker) {
        this.workers.push(worker)
        worker.on('error', e => log.error('Worker', e))
        worker.on('exit', e => log.warn('Worker exit', e))
        worker.on('message', e => {
            e = JSON.parse(e)
            log.debug(5, e)
            switch (e.e) {
                case 'mined':
                    this.emitThreadsStop()
                    this.postBlock(new Block(e.block))
                    break
                case 'hashrate':
                    this.hashrate += e.hashrate
                    break
            }
        })
        worker.on('messageerror', e => log.error('Worker messageerror', e))
        worker.on('online', () => {
            log.info('Worker online:', worker.threadId)
            if (++this.threadsReady === this.threads) this.start()
        })
    }
}
export default Miner