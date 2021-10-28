import * as config_settings from '../config/settings.json'
import Block from './Block'
import Transaction from './Transaction'
import { Worker } from 'worker_threads'
import { cpus } from 'os'
import * as events from 'events'
import HTTPApi from './HTTPApi'
import TCPApi from './TCPApi'
import log from './log'
import * as config_default_env from '../config/default_env.json'
import parseBigInt from './parseBigInt'
import beautifyBigInt from './beautifyBigInt'
import * as config_core from '../config/core.json'
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
    latestBlock: Block
    minByteFee: {
        bigint: bigint,
        remainder: bigint
    }
    pendingTransactions: Array<Transaction>
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
        this.tcpClient.on('block', block => {
            log.debug(1, block)
            this.start()
        })
        this.tcpClient.on('transaction', transaction => {
            if (this.pendingTransactions.find(_transaction => Transaction.calculateHash(transaction).equals(Transaction.calculateHash(_transaction)))) return
            log.debug(1, transaction)
            this.pendingTransactions.push(transaction)
            this.start()
        })
        this.workers = []
        this.threads = cpus().length
        if (config_settings.Miner.threads) this.threads = config_settings.Miner.threads
        this.threadsReady = 0
        this.hashrate = 0
        setInterval(() => {
            log.debug(2, 'Hashrate', this.hashrate)
            this.hashrate = 0
            if (this.mining === false) this.start()
        }, 1000)
        this.miningRewardAddress = miningRewardAddress
        this.setMaxListeners(config_settings.Miner.maxListeners)
        this.mining = false
        this.pendingTransactions = null
    }
    async createNextBlock(address: Buffer, latestBlock: Block) {
        this.minByteFee = {
            bigint: parseBigInt(config_settings.Blockchain.minByteFee.bigint),
            remainder: parseBigInt(config_settings.Blockchain.minByteFee.remainder)
        }
        this.pendingTransactions = this.pendingTransactions
            .filter(e => e.timestamp >= latestBlock.timestamp)
            .sort((a, b) => {
                const byteLength = {
                    a: BigInt(Buffer.byteLength(JSON.stringify(Transaction.minify(a)))),
                    b: BigInt(Buffer.byteLength(JSON.stringify(Transaction.minify(b))))
                }
                const minerFee = {
                    a: parseBigInt(a.minerFee),
                    b: parseBigInt(b.minerFee)
                }
                const div = {
                    a: minerFee.a / byteLength.a,
                    b: minerFee.b / byteLength.b
                }
                if (div.b - div.a < 0) return -1
                else if (div.b - div.a > 0) return 1
                const remainder = {
                    a: minerFee.a % byteLength.a,
                    b: minerFee.b % byteLength.b
                }
                if (remainder.b < remainder.a) return -1
                else if (remainder.b > remainder.a) return 1
                else return 0
            })
        const transactions = [
            new Transaction({
                to: address,
                amount: beautifyBigInt(parseBigInt(config_core.blockReward))
            }),
            ...this.pendingTransactions.filter(transaction => transaction.timestamp < Date.now())
        ]
        const nextBlock = new Block({
            previousHash: latestBlock.hash,
            height: latestBlock.height + 1,
            transactions
        })
        for (let i = 0; i < nextBlock.transactions.length; i++) {
            if (i === 0) continue
            nextBlock.transactions[0].amount = beautifyBigInt(parseBigInt(nextBlock.transactions[0].amount) + parseBigInt(nextBlock.transactions[i].minerFee))
        }
        // make sure block size doesn't exceed max block size when mined
        nextBlock.timestamp = Number.MAX_SAFE_INTEGER
        nextBlock.difficulty = 256 * 2**config_core.smoothness
        nextBlock.hash = Buffer.alloc(32, 0x00)
        nextBlock.nonce = Number.MAX_SAFE_INTEGER
        while (nextBlock.exceedsMaxBlockSize()) {
            const transaction = nextBlock.transactions.pop()
            nextBlock.transactions[0].amount = beautifyBigInt(parseBigInt(nextBlock.transactions[0].amount) - parseBigInt(transaction.minerFee))
            if (nextBlock.transactions.length === 1) break
            this.minByteFee = nextBlock.transactions[nextBlock.transactions.length - 1].byteFee()
        }
        return nextBlock
    }
    async start() {
        if (this.pendingTransactions === null) {
            this.pendingTransactions = await HTTPApi.getPendingTransactions(this.HTTP_API)
            if (this.pendingTransactions === null) return setTimeout(() => this.start(), config_settings.HTTPApi.autoRetry)
            else log.debug(2, 'Pending transactions', this.pendingTransactions)
        }
        const latestBlock = await HTTPApi.getLatestBlock(this.HTTP_API)
        if (latestBlock === null) return setTimeout(() => this.start(), config_settings.HTTPApi.autoRetry)
        const nextBlock = await this.createNextBlock(this.miningRewardAddress, latestBlock)
        this.emitThreadsMineNewBlock(nextBlock, latestBlock)
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
            const code = BigInt(await HTTPApi.postBlock(this.HTTP_API, block))
            if (code) {
                log.warn('Mined block rejected', `\x1b[31m0x${code.toString(16)}\x1b[0m`)
                await this.start()
            }
            else log.info('Mined', `\x1b[32m+${block.transactions[0].amount}\x1b[0m`, block.hash.toString('hex'))
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
                    this.postBlock(Block.spawn(e.block))
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