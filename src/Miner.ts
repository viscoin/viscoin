import * as configSettings from '../config/settings.json'
import * as configNetwork from '../config/network.json'
import Block from './Block'
import { Worker } from 'worker_threads'
import { cpus } from 'os'
import * as events from 'events'
import HTTPApi from './HTTPApi'
import TCPApi from './TCPApi'
import logHardware from './logHardware'
import toLocaleTimeString from './chalk/LocaleTimeString'
import * as chalk from 'chalk'

interface Miner {
    workers: Array<Worker>
    threads: number
    threadsReady: number
    hashrate: number
    miningRewardAddress: Buffer
    tcpClient: TCPApi['Client']
    restarting: boolean
}
class Miner extends events.EventEmitter {
    constructor(miningRewardAddress: Buffer) {
        super()
        this.tcpClient = TCPApi.createClient()
        if (configSettings.TCPApi.enabled) {
            this.tcpClient.connect(configNetwork.TCPApi.port, configNetwork.TCPApi.address, true)
            this.tcpClient.on('block', async () => {
                this.emitThreadsPause()
                await this.start()
            })
            this.tcpClient.on('transaction', async () => {
                await this.restart()
            })
        }
        this.workers = []
        this.threads = cpus().length
        if (configSettings.Miner.threads) this.threads = configSettings.Miner.threads
        this.threadsReady = 0
        this.hashrate = 0
        setInterval(() => {
            this.emit('hashrate', this.hashrate)
            this.hashrate = 0
        }, 1000)
        this.miningRewardAddress = miningRewardAddress
        this.once('ready', async () => await this.start())
        this.restarting = false
        this.setMaxListeners(configSettings.Miner.maxListeners)
        if (configSettings.consoleLog.hardware === true) logHardware()
        if (configSettings.consoleLog.hashrate === true) this.on('hashrate', hashrate => console.log(`${toLocaleTimeString()} ${chalk.yellowBright(hashrate)} ${chalk.redBright('H/s')}`))
    }
    async restart() {
        if (this.restarting === true) {
            return <void> await new Promise(resolve => this.once('restarted', () => resolve()))
        }
        this.restarting = true
        this.emitThreadsPause()
        await this.start()
        setTimeout(() => {
            this.emit('restarted')
            this.restarting = false
        }, configSettings.Miner.restartDelay)
    }
    async start() {
        const block = await this.getNewBlock()
        const previousBlock = await this.getLatestBlock()
        if (block === null
        || previousBlock === null
        || previousBlock.hash.equals(block.previousHash) === false) return setTimeout(async () => {
        // || previousBlock.hash.equals(block.previousHash) === false
        // || block.hasValidTransactions() === false) return setTimeout(async () => {
            await this.start()
        }, configSettings.HTTPApi.autoRetry)
        this.emitThreadsMineNewBlock(block, previousBlock)
    }
    emitThreadsMineNewBlock(block: Block, previousBlock: Block) {
        for (const worker of this.workers) {
            worker.postMessage(JSON.stringify({ e: 'mine', block, previousBlock, threads: this.threads }))
        }
    }
    emitThreadsPause() {
        for (const worker of this.workers) {
            worker.postMessage(JSON.stringify({ e: 'pause' }))
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
    async getLatestBlock() {
        try {
            return await HTTPApi.getLatestBlock()
        }
        catch {
            return null
        }
    }
    async postBlock(block: Block) {
        try {
            const code = await HTTPApi.postBlock(block)
            this.emit('mined', block, code)
            if (code !== 0) await this.start()
        }
        catch {
            setTimeout(async () => {
                await this.postBlock(block)
            }, configSettings.HTTPApi.autoRetry)
        }
    }
    addWorker(worker: Worker) {
        this.workers.push(worker)
        worker.on('message', async e => {
            e = JSON.parse(e)
            switch (e.e) {
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