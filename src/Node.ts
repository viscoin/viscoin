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
import logHardware from './logHardware'
import toLocaleTimeString from './chalk/LocaleTimeString'
import * as chalk from 'chalk'

interface Node {
    workersReady: Set<Worker>
    workersBusy: Set<Worker>
    threads: number
    node: TCPNode
    tcpServer: TCPApi['Server']
    httpApi: HTTPApi
    blockchain: Blockchain
    verifyrate: {
        transaction: number
        block: number
    }
    syncTimeout: NodeJS.Timeout
    syncIndex: number
    syncLoops: number
    queue: {
        blocks: Set<Block>
        transactions: Set<Transaction>
        callbacks: Map<Buffer, Function>
    }
}
class Node extends events.EventEmitter {
    constructor() {
        super()
        this.syncIndex = 0
        this.syncLoops = 0
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
        this.node = new TCPNode()
        this.blockchain = new Blockchain()
        this.tcpServer = TCPApi.createServer()
        this.httpApi = new HTTPApi()
        if (configSettings.Node.hostNode === true) this.node.start()
        if (configSettings.Node.connectToNetwork === true) this.reconnect()
        if (configSettings.Node.sync === true) this.sync()
        this.node.on('block', async (block, cb) => this.emit('add-block', block, code => cb(code)))
        this.node.on('transaction', async (transaction, cb) => this.emit('add-transaction', transaction, code => cb(code)))
        this.node.on('node', (node, cb) => {
            if (configSettings.Node.connectToNetwork) {
                cb(this.node.connectToNode(node))
            }
            else cb(0)
            this.emit('node', node)
        })
        this.node.on('peer', peer => {
            if (!fs.existsSync(configSettings.logs.path)) fs.mkdirSync(configSettings.logs.path)
            if (configSettings.logs.save === true) fs.appendFileSync(`${configSettings.logs.path}/connections.txt`, `${peer.socket.remoteAddress}:${peer.socket.remotePort}\n`)
            this.emit('peer', peer)
        })
        this.node.on('ban', peer => {
            if (!fs.existsSync(configSettings.logs.path)) fs.mkdirSync(configSettings.logs.path)
            if (configSettings.logs.save === true) fs.appendFileSync(`${configSettings.logs.path}/banned.txt`, `${peer.socket.remoteAddress}:${peer.socket.remotePort}\n`)
            this.emit('ban', peer)
        })
        if (configSettings.TCPApi.enabled) this.tcpServer.start()
        if (configSettings.HTTPApi.enabled) {
            this.httpApi.start()
            this.httpApi.on('get-config', cb => cb(configSettings))
            this.httpApi.on('get-transactions-pending', cb => cb(this.blockchain.pendingTransactions.map(e => Transaction.minify(e))))
            this.httpApi.on('get-block', async (height, cb) => cb(Block.minify(await this.blockchain.getBlockByHeight(height))))
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
        this.on('add-block', async (block: Block, cb: Function) => {
            if (this.blockchain.height === undefined) return
            if (this.queue.blocks.size > configSettings.Node.queue.blocks
            || block.height < this.blockchain.height - configSettings.trustedAfterBlocks
            || this.blockchain.hashes.current.includes(block.hash.toString('binary'))) return
            if (this.queue.callbacks.has(block.hash)) return
            this.queue.callbacks.set(block.hash, cb)
            this.queue.blocks.add(block)
        })
        this.on('add-transaction', async (transaction: Transaction, cb: Function) => {
            if (this.queue.transactions.size > configSettings.Node.queue.transactions) return
            if (this.queue.callbacks.has(transaction.signature)) return
            this.queue.callbacks.set(transaction.signature, cb)
            this.queue.transactions.add(transaction)
        })
        this.on('block', (block, code) => {
            if (code !== 0) return
            const buffer = protocol.constructBuffer('block', Block.minify(block))
            this.node.broadcast(buffer)
            if (configSettings.TCPApi.enabled) this.tcpServer.broadcast(buffer)
        })
        this.on('transaction', (transaction, code) => {
            if (code !== 0) return
            const buffer = protocol.constructBuffer('transaction', Transaction.minify(transaction))
            this.node.broadcast(buffer)
            if (configSettings.TCPApi.enabled) this.tcpServer.broadcast(buffer)
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
        if (configSettings.consoleLog.hardware === true) logHardware()
        if (configSettings.consoleLog.verifyrate === true) this.on('verifyrate', ({ transaction, block }) => console.log(`${toLocaleTimeString()} ${chalk.yellowBright(block)} ${chalk.redBright('B/s')} ${chalk.yellowBright(transaction)} ${chalk.redBright('T/s')}`))
    }
    getNodes() {
        let arr = parseNodes(fs.readFileSync(configSettings.addressList, 'binary'))
        if (configSettings.logs.use === true) {
            if (fs.existsSync(`${configSettings.logs.path}/connections.txt`)) arr.push(...parseNodes(fs.readFileSync(`${configSettings.logs.path}/connections.txt`, 'binary')))
            if (fs.existsSync(`${configSettings.logs.path}/banned.txt`)) {
                const _arr = parseNodes(fs.readFileSync(`${configSettings.logs.path}/banned.txt`, 'binary'))
                arr = arr.filter(e => _arr.includes(e) === false)
            }
        }
        return arr
    }
    reconnect() {
        this.node.connectToNetwork(this.getNodes())
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
                        this.emit('worker')
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
            if (await this.blockchain.addBlock(block)) code = 2
        }
        if (this.queue.callbacks.has(block.hash)) {
            this.queue.callbacks.get(block.hash)(code)
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
            this.queue.callbacks.get(transaction.signature)(code)
            this.queue.callbacks.delete(transaction.signature)
        }
        this.emit('transaction', transaction, code)
        setImmediate(this.nextTransaction.bind(this))
    }
    async sync() {
        if (this.blockchain.height !== undefined && ++this.syncIndex > this.blockchain.height) {
            if (++this.syncLoops >= this.blockchain.height / configSettings.trustedAfterBlocks) {
                this.syncIndex = 0
                this.syncLoops = 0
            }
            else this.syncIndex = this.blockchain.height - configSettings.trustedAfterBlocks
        }
        const block = await this.blockchain.getBlockByHeight(this.syncIndex)
        // console.log('sync', block?.height, height)
        if (block !== null) await this.node.broadcast(protocol.constructBuffer('block', Block.minify(block)))
        this.syncTimeout = setTimeout(this.sync.bind(this), configSettings.Node.syncTimeout)
    }
}
export default Node