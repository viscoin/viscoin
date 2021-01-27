import Blockchain from "./Blockchain"
import TCPNetworkNode from "./TCPNetworkNode"
import TCPApi from "./TCPApi"
import HTTPApi from "./HTTPApi"
import * as config from '../config.json'
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
    node: TCPNetworkNode
    tcpServer: TCPApi['Server']
    httpApi: HTTPApi
    blockchain: Blockchain
    verifyrate: {
        transaction: number
        block: number
    }
}
class Node extends events.EventEmitter {
    constructor() {
        super()
        this.workersReady = new Set()
        this.workersBusy = new Set()
        this.threads = cpus().length
        if (config.Node.threads) this.threads = config.Node.threads
        this.node = new TCPNetworkNode()
        this.blockchain = new Blockchain()
        this.tcpServer = TCPApi.createServer()
        this.httpApi = new HTTPApi()
        let a = parseNodes(fs.readFileSync(config.addressList, 'binary'))
        if (config.logs.use) {
            if (fs.existsSync(`${config.logs.path}/connections.txt`)) a.push(...parseNodes(fs.readFileSync(`${config.logs.path}/connections.txt`, 'binary')))
            if (fs.existsSync(`${config.logs.path}/blacklisted.txt`)) {
                const b = parseNodes(fs.readFileSync(`${config.logs.path}/blacklisted.txt`, 'binary'))
                a = a.filter(e => b.includes(e) === false)
            }
        }
        if (config.Node.hostNode === true) this.node.start()
        if (config.Node.connectToNetwork === true) this.node.connectToNetwork(a)
        if (config.Node.syncNode.enabled === true) this.nextSync()
        this.node.on('block', async block => this.emit('add-block', block))
        this.node.on('transaction', async transaction => this.emit('add-transaction', transaction))
        this.node.on('node', node => {
            if (config.Node.connectToNetwork) this.node.connectToNetwork([ <{ port: number, address: string }> node ])
            this.emit('node', node)
        })
        this.node.on('socket', socket => {
            if (!fs.existsSync(config.logs.path)) fs.mkdirSync(config.logs.path)
            if (config.logs.save) fs.appendFileSync(`${config.logs.path}/connections.txt`, `${socket.remoteAddress}:${socket.remotePort}\n`)
            this.emit('socket', socket)
        })
        this.node.on('blacklist', (socket, reason) => {
            if (!fs.existsSync(config.logs.path)) fs.mkdirSync(config.logs.path)
            if (config.logs.save) fs.appendFileSync(`${config.logs.path}/blacklisted.txt`, `${socket.remoteAddress}:${socket.remotePort}\n`)
            this.emit('blacklist', socket, reason)
        })
        if (config.TCPApi.enabled) {
            this.tcpServer.start()
        }
        if (config.HTTPApi.enabled) {
            this.httpApi.start()
            this.httpApi.on('get-config', cb => cb(config))
            this.httpApi.on('get-transactions-pending', cb => cb(this.blockchain.pendingTransactions.map(e => Transaction.minify(e))))
            this.httpApi.on('get-block', async (height, cb) => cb(Block.minify(await this.blockchain.getBlockByHeight(height))))
            this.httpApi.on('get-block-latest', async cb => cb(Block.minify(await this.blockchain.getLatestBlock())))
            this.httpApi.on('get-block-new', async (address, cb) => cb(Block.minify(await this.blockchain.getNewBlock(address))))
            this.httpApi.on('get-balance-address', async (address, cb) => cb(beautifyBigInt(await this.blockchain.getBalanceOfAddress(address))))
            this.httpApi.on('post-transaction', async (transaction, cb) => this.emit('add-transaction', transaction, code => cb(code)))
            this.httpApi.on('post-block', async (block, cb) => this.emit('add-block', block, code => cb(code)))
            this.httpApi.on('get-transactions-address', async (address, cb) => {
                const projection = `
                    ${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.to.name}
                    ${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.from.name}
                    ${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.amount.name}
                    ${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.minerFee.name}
                    ${config.mongoose.schema.block.transactions.name}.${config.mongoose.schema.transaction.timestamp.name}
                    ${config.mongoose.schema.block.timestamp.name}
                `
                const { transactions, unconfirmed_transactions } = await this.blockchain.getTransactionsOfAddress(address, projection)
                cb([
                    ...transactions.map(e => Transaction.minify(e)),
                    ...unconfirmed_transactions.map(e => Transaction.minify(e))
                ])
            })
        }
        this.on('add-transaction', async (transaction: Transaction, cb) => {
            let code = -1
            try {
                code = await this.assignJob({
                    e: 'transaction',
                    transaction: Transaction.minify(transaction)
                })
            }
            catch {}
            if (code === 0) code = await this.blockchain.addTransaction(transaction)
            if (code === 0) {
                if (config.TCPApi.enabled) this.tcpServer.broadcast(protocol.constructDataBuffer('transaction', Transaction.minify(transaction)))
                this.emit('transaction', transaction, code)
            }
            if (cb !== undefined) cb(code)
        })
        this.on('add-block', async (block: Block, cb) => {
            let code = -1
            try {
                code = await this.assignJob({
                    e: 'block',
                    block: Block.minify(block)
                })
            }
            catch {}
            if (code === 0) code = await this.blockchain.addBlock(block)
            if (code === 0) {
                if (config.TCPApi.enabled) this.tcpServer.broadcast(protocol.constructDataBuffer('block', Block.minify(block)))
                this.emit('block', block, code)
            }
            if (cb !== undefined) cb(code)
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
    async nextSync() {
        const block = await this.blockchain.getNextSyncBlock()
        if (block) {
            const buffer = protocol.constructDataBuffer('block', Block.minify(block))
            this.node.broadcastAndStoreDataHash(buffer)
        }
        setTimeout(this.nextSync.bind(this), config.Node.syncNode.nextSyncTimeout)
    }
    addWorker(worker: Worker) {
        this.workersBusy.add(worker)
        worker.once('message', e => {
            e = JSON.parse(e)
            switch (e.e) {
                case 'ready':
                    this.workersBusy.delete(worker)
                    this.workersReady.add(worker)
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
                worker.once('message', e => {
                    e = JSON.parse(e)
                    this.workersBusy.delete(worker)
                    this.workersReady.add(worker)
                    resolve(e)
                })
                return
            }
            reject()
        })
    }
}
export default Node