import * as config from '../config.json'
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
    miningRewardAddress: Buffer
}
class MinerClient extends BaseClient {
    constructor(miningRewardAddress: Buffer) {
        super()
        this.workers = []
        this.threads = cpus().length
        if (config.MinerClient.threads) this.threads = config.MinerClient.threads
        this.threadsReady = 0
        this.hashrate = 0
        setInterval(() => {
            this.emit('hashrate', this.hashrate)
            this.hashrate = 0
        }, 1000)
        this.miningRewardAddress = miningRewardAddress
        this.on('transaction', (transaction, code) => {
                // !
    // calling this function when pendingtransactions is full and the transaction does not get added will result in people being able to abuse the miner by keeping sending transaction with 0 mining reward
    // resetting the miners nonce resulting in miner being stuck without being able to reach the nonce where it mines block

            if (code === 0) this.emitThreadsMineNewBlock()
        })
        // !
        this.on('block', async (block, code) => {
            const latestBlock = await this.blockchain.getLatestBlock()
            if (block.hash.equals(latestBlock.hash)) this.emitThreadsMineNewBlock()
        })
    }
    async emitThreadsMineNewBlock() {
        const block = await this.blockchain.getNewBlock(this.miningRewardAddress)
        for (const worker of this.workers) {
            worker.postMessage(JSON.stringify({ code: 'mine', block, threads: this.threads }))
        }
    }
    addWorker(worker: Worker) {
        this.workers.push(worker)
        worker.on('message', async e => {
            e = JSON.parse(e)
            switch (e.code) {
                case 'ready':
                    if (++this.threadsReady === this.threads) await this.emitThreadsMineNewBlock()
                    break
                case 'mined':
                    const block = new Block(e.block)
                    const code = await this.blockchain.addBlock(block)
                    this.emit('mined', block, code)
                    this.blockchain.pendingTransactions = []
                    this.node.broadcastAndStoreDataHash(protocol.constructDataBuffer('block', Block.minify(block)))
                    await this.emitThreadsMineNewBlock()
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