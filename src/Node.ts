import Blockchain from "./Blockchain"
import TCPNode from "./TCPNode"
import TCPApi from "./TCPApi"
import HTTPApi from "./HTTPApi"
import * as configSettings from '../config/settings.json'
import * as configMongoose from '../config/mongoose.json'
import * as events from 'events'
import protocol from './protocol'
import Block from './Block'
import * as fs from 'fs'
import Transaction from "./Transaction"
import beautifyBigInt from "./beautifyBigInt"
import parseNodes from './parseNodes'
import { Worker } from 'worker_threads'
import { cpus } from 'os'

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
        this.syncTimeoutMS = configSettings.Peer.hashes.timeToLive
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
        if (configSettings.Node.threads) this.threads = configSettings.Node.threads
        this.blockchain = new Blockchain()
        if (configSettings.Node.HTTPApi === true) {
            this.httpApi = new HTTPApi()
            this.httpApi.start()
            this.httpApi.on('get-config', cb => cb(configSettings))
            this.httpApi.on('get-transactions-pending', cb => cb(this.blockchain.pendingTransactions.map(e => Transaction.minify(e))))
            this.httpApi.on('get-block-height', async (height, cb) => cb(Block.minify(await this.blockchain.getBlockByHeight(height))))
            this.httpApi.on('get-block-hash', async (hash, cb) => cb(Block.minify(await this.blockchain.getBlockByHash(hash))))
            this.httpApi.on('get-block-latest', async cb => cb(Block.minify(await this.blockchain.getLatestBlock())))
            this.httpApi.on('get-block-new', async (address, cb) => cb(Block.minify(await this.blockchain.getNewBlock(address))))
            this.httpApi.on('get-balance-address', async (address, cb) => cb(beautifyBigInt(await this.blockchain.getBalanceOfAddress(address))))
            this.httpApi.on('transaction', async (transaction, cb) => this.emit('add-transaction', transaction, code => cb(code)))
            this.httpApi.on('block', async (block, cb) => this.emit('add-block', block, code => cb(code)))
            this.httpApi.on('get-transactions-address', async (address, cb) => {
                const projection = `
                    ${configMongoose.schema.block.transactions.name}.${configMongoose.schema.transaction.to.name}
                    ${configMongoose.schema.block.transactions.name}.${configMongoose.schema.transaction.from.name}
                    ${configMongoose.schema.block.transactions.name}.${configMongoose.schema.transaction.amount.name}
                    ${configMongoose.schema.block.transactions.name}.${configMongoose.schema.transaction.minerFee.name}
                    ${configMongoose.schema.block.transactions.name}.${configMongoose.schema.transaction.timestamp.name}
                    ${configMongoose.schema.block.timestamp.name}
                `
                const { transactions, unconfirmed_transactions } = await this.blockchain.getTransactionsOfAddress(address, projection)
                cb([
                    ...transactions.map(e => Transaction.minify(e)),
                    ...unconfirmed_transactions.map(e => Transaction.minify(e))
                ])
            })
        }
        if (configSettings.Node.TCPApi === true) {
            this.tcpApi = TCPApi.createServer()
            this.tcpApi.start()
        }
        if (configSettings.Node.TCPNode === true) {
            this.tcpNode = new TCPNode()
            this.tcpNode.start()
            this.tcpNode.on('block', (block, cb) => this.emit('add-block', block, code => {
                if (code === 0) {
                    if (this.hashes.delete(block.previousHash.toString('binary'))) {
                        this.hashes.add(block.hash.toString('binary'))
                        this.syncTimeoutMS /= 4
                        if (this.syncTimeoutMS < 1) this.syncTimeoutMS = 1
                    }
                }
                cb(code)
            }))
            this.tcpNode.on('transaction', (transaction, cb) => this.emit('add-transaction', transaction, code => cb(code)))
            this.tcpNode.on('node', (node, cb) => {
                if (configSettings.Node.connectToNetwork) cb(this.tcpNode.connectToNode(node))
            })
            this.tcpNode.on('sync', async (hash, cb) => {
                for (let i = 0; i < configSettings.Node.syncBlocksPerRequest; i++) {
                    const block = await this.blockchain.getBlockByPreviousHash(hash)
                    if (block === null) return
                    cb(Block.minify(block))
                    hash = block.hash
                }
            })
            this.tcpNode.on('peer-connect', peer => {
                if (configSettings.logs.save === true) {
                    if (!fs.existsSync(configSettings.logs.path)) fs.mkdirSync(configSettings.logs.path)
                    fs.appendFileSync(`${configSettings.logs.path}/connections.txt`, `${peer.remoteAddress}:${peer.remotePort}${configSettings.EOL}`)
                }
            })
            this.tcpNode.on('peer-ban', peer => {
                if (configSettings.logs.save === true) {
                    if (!fs.existsSync(configSettings.logs.path)) fs.mkdirSync(configSettings.logs.path)
                    fs.appendFileSync(`${configSettings.logs.path}/banned.txt`, `${peer.remoteAddress}${configSettings.EOL}`)
                }
            })
        }
        this.blockchain.on('loaded', () => {
            if (configSettings.Node.connectToNetwork === true) this.reconnect()
            if (configSettings.Node.sync === true) this.sync()
        })
        this.on('add-block', async (block: Block, cb: Function) => {
            if (this.blockchain.height === null) return
            if (this.queue.blocks.size > configSettings.Node.queue.blocks
            || block.height < this.blockchain.height - configSettings.trustedAfterBlocks) return
            if (this.blockchain.hashes.current.includes(block.hash.toString('binary'))) return cb(0)
            if (this.queue.callbacks.has(block.hash)) return this.queue.callbacks.set(block.hash, [ ...this.queue.callbacks.get(block.hash), cb ])
            this.queue.callbacks.set(block.hash, [ cb ])
            this.queue.blocks.add(block)
        })
        this.on('add-transaction', async (transaction: Transaction, cb: Function) => {
            if (this.queue.transactions.size > configSettings.Node.queue.transactions) return
            if (this.queue.callbacks.has(transaction.signature)) return this.queue.callbacks.set(transaction.signature, [ ...this.queue.callbacks.get(transaction.signature), cb ])
            this.queue.callbacks.set(transaction.signature, [ cb ])
            this.queue.transactions.add(transaction)
        })
        this.on('block', (block, code) => {
            if (code !== 0) return
            const buffer = protocol.constructBuffer('block', Block.minify(block))
            this.tcpNode.broadcast(buffer)
            if (configSettings.Node.TCPApi === true) this.tcpApi.broadcast(buffer)
        })
        this.on('transaction', (transaction, code) => {
            if (code !== 0) return
            const buffer = protocol.constructBuffer('transaction', Transaction.minify(transaction))
            this.tcpNode.broadcast(buffer)
            if (configSettings.Node.TCPApi === true) this.tcpApi.broadcast(buffer)
        })
        this.verifyrate = {
            transaction: 0,
            block: 0
        }
        setInterval(() => {
            this.emit('verifyrate', this.verifyrate)
            this.verifyrate = {
                transaction: 0,
                block: 0
            }
        }, 1000)
    }
    getNodes() {
        let arr = parseNodes(fs.readFileSync(configSettings.addressList).toString())
        if (configSettings.logs.use === true) {
            if (fs.existsSync(`${configSettings.logs.path}/connections.txt`)) arr.push(...parseNodes(fs.readFileSync(`${configSettings.logs.path}/connections.txt`).toString()))
        }
        return arr
    }
    reconnect() {
        this.tcpNode.connectToNetwork(this.getNodes())
        if (configSettings.Node.autoReconnect) setTimeout(this.reconnect.bind(this), configSettings.Node.autoReconnect)
    }
    addWorker(worker: Worker) {
        this.workersBusy.add(worker)
        worker.once('message', e => {
            e = JSON.parse(e)
            switch (e.e) {
                case 'ready':
                    this.workersBusy.delete(worker)
                    this.workersReady.add(worker)
                    this.emit('thread', e.threadId)
                    break
            }
        })
        worker.on('error', () => {})
        worker.on('exit', () => {})
        worker.on('message', e => {
            e = JSON.parse(e)
            switch (e.e) {
                case 'verifyrate':
                    this.verifyrate.transaction += e.verifyrate.transaction
                    this.verifyrate.block += e.verifyrate.block
                    break
            }
        })
        worker.on('messageerror', () => {})
        worker.on('online', () => {})
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
        this.emit('block', block, code)
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
        this.emit('transaction', transaction, code)
        setImmediate(this.nextTransaction.bind(this))
    }
    async sync() {
        if (this.hashes.size === 0) {
            const latestBlock = await this.blockchain.getLatestBlock()
            let block = await this.blockchain.getBlockByHeight(latestBlock.height - configSettings.trustedAfterBlocks)
            if (block === null) block = await this.blockchain.createGenesisBlock()
            if (block !== null) this.hashes.add(block.hash.toString('binary'))
        }
        if (this.tcpNode.peers.size > 0) this.emit('sync')
        for (const hash of this.hashes) {
            this.tcpNode.broadcast(protocol.constructBuffer('sync', Buffer.from(hash, 'binary')), true)
        }
        this.syncTimeoutMS *= 2
        if (this.syncTimeoutMS > configSettings.Peer.hashes.timeToLive) this.syncTimeoutMS = configSettings.Peer.hashes.timeToLive
        this.syncTimeout = setTimeout(this.sync.bind(this), this.syncTimeoutMS)
    }
}
export default Node