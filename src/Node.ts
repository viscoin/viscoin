import Blockchain from "./Blockchain"
import TCPNode from "./TCPNode"
import TCPApi from "./TCPApi"
import HTTPApi from "./HTTPApi"
import * as config_settings from '../config/settings.json'
import * as config_mongoose from '../config/mongoose.json'
import * as events from 'events'
import protocol from './protocol'
import Block from './Block'
import Transaction from "./Transaction"
import beautifyBigInt from "./beautifyBigInt"
import { Worker } from 'worker_threads'
import { cpus } from 'os'
import Model_Node from './mongoose/model/node'
import log from './log'

interface Node {
    workersReady: Set<Worker>
    workersBusy: Set<Worker>
    threads: number
    tcpNode: TCPNode
    tcpApi: TCPApi['Server']
    httpApi: HTTPApi
    blockchain: Blockchain
    verifyrate: {
        transaction: number
        block: number
    }
    syncTimeout: NodeJS.Timeout
    queue: {
        blocks: Set<Block>
        transactions: Set<Transaction>
        callbacks: Map<Buffer, Array<Function>>
    }
    hashes: Set<string>
    syncTimeoutMS: number
}
class Node extends events.EventEmitter {
    constructor() {
        super()
        this.syncTimeoutMS = 1000 / config_settings.Peer.maxRequestsPerSecond.sync
        this.hashes = new Set()
        this.queue = {
            blocks: new Set(),
            transactions: new Set(),
            callbacks: new Map()
        }
        this.nextBlock()
        this.nextTransaction()
        this.workersReady = new Set()
        this.workersBusy = new Set()
        this.threads = cpus().length
        if (config_settings.Node.threads) this.threads = config_settings.Node.threads
        this.blockchain = new Blockchain()
        if (config_settings.Node.HTTPApi === true) {
            this.httpApi = new HTTPApi()
            this.httpApi.start()
            this.httpApi.on('get-config', cb => cb(config_settings))
            this.httpApi.on('get-transactions-pending', cb => cb(this.blockchain.pendingTransactions.map(e => Transaction.minify(e))))
            this.httpApi.on('get-block-transaction-signature', async (signature, cb) => cb(Block.minify(await this.blockchain.getBlockByTransactionSignature(signature))))
            this.httpApi.on('get-block-height', async (height, cb) => cb(Block.minify(await this.blockchain.getBlockByHeight(height))))
            this.httpApi.on('get-block-hash', async (hash, cb) => cb(Block.minify(await this.blockchain.getBlockByHash(hash))))
            this.httpApi.on('get-block-latest', async cb => cb(Block.minify(await this.blockchain.getLatestBlock())))
            this.httpApi.on('get-block-new', async (address, cb) => cb(Block.minify(await this.blockchain.getNewBlock(address))))
            this.httpApi.on('get-balance-address', async (address, cb) => cb(beautifyBigInt(await this.blockchain.getBalanceOfAddress(address))))
            this.httpApi.on('transaction', async (transaction, cb) => this.emit('add-transaction', transaction, code => cb(code)))
            this.httpApi.on('block', async (block, cb) => this.emit('add-block', block, code => cb(code)))
            this.httpApi.on('get-transactions-address', async (address, cb) => {
                const projection = `
                    ${config_mongoose.block.transactions.name}.${config_mongoose.transaction.to.name}
                    ${config_mongoose.block.transactions.name}.${config_mongoose.transaction.from.name}
                    ${config_mongoose.block.transactions.name}.${config_mongoose.transaction.amount.name}
                    ${config_mongoose.block.transactions.name}.${config_mongoose.transaction.minerFee.name}
                    ${config_mongoose.block.transactions.name}.${config_mongoose.transaction.timestamp.name}
                    ${config_mongoose.block.timestamp.name}
                `
                const { transactions, unconfirmed_transactions } = await this.blockchain.getTransactionsOfAddress(address, projection)
                cb([
                    ...transactions.map(e => Transaction.minify(e)),
                    ...unconfirmed_transactions.map(e => Transaction.minify(e))
                ])
            })
            this.httpApi.on('get-peers', async cb => {
                const arr = []
                for (const peer of this.tcpNode.peers) arr.push(`${peer.remoteAddress}:${peer.remotePort}`)
                cb(arr)
            })
        }
        if (config_settings.Node.TCPApi === true) {
            this.tcpApi = TCPApi.createServer()
            this.tcpApi.start()
        }
        if (config_settings.Node.TCPNode === true) {
            this.tcpNode = new TCPNode()
            this.tcpNode.start()
            this.tcpNode.on('block', (block, cb) => this.emit('add-block', block, code => {
                if (code === 0) {
                    if (this.hashes.delete(block.previousHash.toString('binary'))) {
                        this.hashes.add(block.hash.toString('binary'))
                        this.syncTimeoutMS /= 1.11
                        if (this.syncTimeoutMS < 1) this.syncTimeoutMS = 1
                    }
                }
                cb(code)
            }))
            this.tcpNode.on('transaction', (transaction, cb) => this.emit('add-transaction', transaction, code => cb(code)))
            this.tcpNode.on('node', (node, cb) => {
                if (config_settings.Node.connectToNetwork) cb(this.tcpNode.connectToNode(node))
            })
            this.tcpNode.on('sync', async (hash, cb) => {
                for (let i = 0; i < config_settings.Node.syncBlocksPerRequest; i++) {
                    const block = await this.blockchain.getBlockByPreviousHash(hash)
                    if (block === null) return
                    cb(Block.minify(block))
                    hash = block.hash
                }
            })
            this.tcpNode.on('peer-connect', async peer => {
                if (!peer.remoteAddress) return
                if (await Model_Node.exists({
                    host: peer.remoteAddress
                })) return
                await new Model_Node({
                    host: peer.remoteAddress
                }).save()
            })
            this.tcpNode.on('peer-ban', async peer => {
                if (!peer.remoteAddress) return
                const doc = await Model_Node.findOne({
                    host: peer.remoteAddress
                }).exec()
                log.debug(2, doc)
                if (doc) {
                    doc.banned = Date.now()
                    await doc.save()
                }
            })
        }
        this.blockchain.on('loaded', () => {
            if (config_settings.Node.connectToNetwork === true) {
                log.info('Connecting to other nodes')
                this.reconnect()
            }
            if (config_settings.Node.sync === true) {
                log.info('Starting sync')
                this.sync()
            }
        })
        this.on('add-block', async (block: Block, cb: Function) => {
            if (this.blockchain.height === null) return
            if (this.queue.blocks.size > config_settings.Node.queue.blocks
            || block.height < this.blockchain.height - config_settings.trustedAfterBlocks) return
            if (!block.hash) return
            if (this.blockchain.hashes.current.includes(block.hash.toString('binary'))) return cb(0)
            if (this.queue.callbacks.has(block.hash)) return this.queue.callbacks.set(block.hash, [ ...this.queue.callbacks.get(block.hash), cb ])
            this.queue.callbacks.set(block.hash, [ cb ])
            this.queue.blocks.add(block)
        })
        this.on('add-transaction', async (transaction: Transaction, cb: Function) => {
            if (this.queue.transactions.size > config_settings.Node.queue.transactions) return
            if (this.queue.callbacks.has(transaction.signature)) return this.queue.callbacks.set(transaction.signature, [ ...this.queue.callbacks.get(transaction.signature), cb ])
            this.queue.callbacks.set(transaction.signature, [ cb ])
            this.queue.transactions.add(transaction)
        })
        this.on('block', (block, code) => {
            if (code !== 0) return
            const buffer = protocol.constructBuffer('block', Block.minify(block))
            this.tcpNode.broadcast(buffer)
            if (config_settings.Node.TCPApi === true) this.tcpApi.broadcast(buffer)
        })
        this.on('transaction', (transaction, code) => {
            if (code !== 0) return
            const buffer = protocol.constructBuffer('transaction', Transaction.minify(transaction))
            this.tcpNode.broadcast(buffer)
            if (config_settings.Node.TCPApi === true) this.tcpApi.broadcast(buffer)
        })
        this.verifyrate = {
            transaction: 0,
            block: 0
        }
        setInterval(() => {
            // this.emit('verifyrate', this.verifyrate)
            log.debug(1, 'Verifyrate', this.verifyrate)
            this.verifyrate = {
                transaction: 0,
                block: 0
            }
        }, 1000)
    }
    async getNodes() {
        return (await Model_Node.find({
            banned: {
                $lt: Date.now() - config_settings.Node.banTimeout
            }
        }, 'host', { lean: true }).exec()).map(e => e.host)
    }
    async reconnect() {
        log.debug(3, 'Reconnecting to other nodes')
        this.tcpNode.connectToNetwork(await this.getNodes())
        if (config_settings.Node.autoReconnect) setTimeout(this.reconnect.bind(this), config_settings.Node.autoReconnect)
    }
    addWorker(worker: Worker) {
        this.workersBusy.add(worker)
        worker.on('error', e => log.error('Worker', e))
        worker.on('exit', e => log.warn('Worker exit', e))
        worker.on('message', e => {
            e = JSON.parse(e)
            log.debug(5, e)
            switch (e.e) {
                case 'verifyrate':
                    this.verifyrate.transaction += e.verifyrate.transaction
                    this.verifyrate.block += e.verifyrate.block
                    break
            }
        })
        worker.on('messageerror', e => log.error('Worker messageerror', e))
        worker.on('online', () => {
            log.info('Worker online:', worker.threadId)
            this.workersBusy.delete(worker)
            this.workersReady.add(worker)
        })
    }
    assignJob(e: object) {
        return <any> new Promise((resolve, reject) => {
            for (const worker of this.workersReady) {
                this.workersReady.delete(worker)
                this.workersBusy.add(worker)
                worker.postMessage(JSON.stringify(e))
                const onMessage = () => {
                    worker.once('message', e => {
                        e = JSON.parse(e)
                        if (e.e === 'verifyrate') return onMessage()
                        this.workersBusy.delete(worker)
                        this.workersReady.add(worker)
                        // this.emit('worker')
                        resolve(e)
                    })
                }
                onMessage()
                return
            }
            reject()
        })
    }
    async nextBlock() {
        const block = [...this.queue.blocks].sort((a, b) => a.height - b.height)[0]
        if (block === undefined || this.workersReady.size === 0) return setImmediate(this.nextBlock.bind(this))
        this.queue.blocks.delete(block)
        let code = 0
        try {
            if (await this.assignJob({
                e: 'block',
                block: Block.minify(block)
            }) !== 0) code = 1
        }
        catch {}
        if (code === 0) {
            if (await this.blockchain.addBlock(block) !== 0) code = 2
        }
        if (this.queue.callbacks.has(block.hash)) {
            const cbs = this.queue.callbacks.get(block.hash)
            for (const cb of cbs) cb(code)
            this.queue.callbacks.delete(block.hash)
        }
        // this.emit('block', block, code)
        log.debug(2, 'Block:', block.hash.toString('hex'), block.height, code)
        setImmediate(this.nextBlock.bind(this))
    }
    async nextTransaction() {
        const transaction = [...this.queue.transactions].sort((a, b) => a.timestamp - b.timestamp)[0]
        if (transaction === undefined || this.workersReady.size === 0) return setImmediate(this.nextTransaction.bind(this))
        this.queue.transactions.delete(transaction)
        let code = 0
        try {
            if (await this.assignJob({
                e: 'transaction',
                transaction: Transaction.minify(transaction)
            }) !== 0) code = 1
        }
        catch {}
        if (code === 0) {
            if (await this.blockchain.addTransaction(transaction) !== 0) code = 2
        }
        if (this.queue.callbacks.has(transaction.signature)) {
            const cbs = this.queue.callbacks.get(transaction.signature)
            for (const cb of cbs) cb(code)
            this.queue.callbacks.delete(transaction.signature)
        }
        // this.emit('transaction', transaction, code)
        log.debug(2, 'Transaction:', code)
        setImmediate(this.nextTransaction.bind(this))
    }
    async sync() {
        if (this.hashes.size === 0) {
            const latestBlock = await this.blockchain.getLatestBlock()
            let block = await this.blockchain.getBlockByHeight(latestBlock.height - config_settings.trustedAfterBlocks)
            if (block === null) block = await this.blockchain.createGenesisBlock()
            if (block !== null) this.hashes.add(block.hash.toString('binary'))
        }
        // if (this.tcpNode.peers.size > 0) this.emit('sync')
        log.debug(4, 'Sync:', [...this.hashes].map(e => Buffer.from(e, 'binary').toString('hex')))
        for (const hash of this.hashes) {
            this.tcpNode.broadcast(protocol.constructBuffer('sync', Buffer.from(hash, 'binary')), true)
        }
        this.syncTimeoutMS *= 1.1
        if (this.syncTimeoutMS > config_settings.Peer.hashes.timeToLive) this.syncTimeoutMS = config_settings.Peer.hashes.timeToLive
        this.syncTimeout = setTimeout(this.sync.bind(this), this.syncTimeoutMS)
    }
}
export default Node