import Blockchain from "./Blockchain"
import TCPNode from "./TCPNode"
import TCPApi from "./TCPApi"
import HTTPApi from "./HTTPApi"
import * as config_settings from '../config/settings.json'
import * as events from 'events'
import protocol from './protocol'
import Block from './Block'
import Transaction from "./Transaction"
import beautifyBigInt from "./beautifyBigInt"
import { Worker } from 'worker_threads'
import { cpus } from 'os'
import log from './log'
import Address from './Address'
interface Node {
    nodes: any
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
        hashes: number
    }
    queue: {
        blocks: Set<Block>
        transactions: Set<Transaction>
        callbacks: Map<string, Array<Function>>
    }
    sync: {
        timeout: number
        timestamp: number
        height: number
    }
}
class Node extends events.EventEmitter {
    constructor({ nodes, blocks }, commit: string) {
        super()
        this.nodes = nodes
        this.sync = {
            timeout: 0,
            timestamp: Date.now(),
            height: 0
        }
        this.queue = {
            blocks: new Set(),
            transactions: new Set(),
            callbacks: new Map()
        }
        this.workersReady = new Set()
        this.workersBusy = new Set()
        this.threads = cpus().length
        if (config_settings.Node.threads) this.threads = config_settings.Node.threads
        this.httpApi = new HTTPApi(commit)
        this.tcpApi = TCPApi.createServer()
        this.tcpNode = new TCPNode(nodes)
        this.blockchain = new Blockchain({ blocks })
        this.blockchain.once('loaded', async () => {
            setInterval(() => {
                log.debug(2, 'Verifyrate', this.verifyrate)
                this.verifyrate = {
                    transaction: 0,
                    block: 0,
                    hashes: 0
                }
            }, 1000)

            // HTTP API
            if (config_settings.Node.HTTPApi === true) {
                this.httpApi.start()
                this.httpApi.on('get-config', cb => cb(config_settings))
                this.httpApi.on('get-addresses', (start, amount, cb) => {
                    let arr = [...this.blockchain.addresses].map(e => {
                        return [ Address.toString(Buffer.from(e[0], 'hex')), beautifyBigInt(e[1]) ]
                    })
                    start = start || 0
                    const end = amount ? start + amount : undefined
                    arr = arr.sort((a, b) => Number(b[1]) - Number(a[1])).slice(start, end)
                    cb(arr)
                })
                this.httpApi.on('get-transactions-pending', cb => cb(this.blockchain.pendingTransactions.map(e => Transaction.minify(e))))
                this.httpApi.on('get-block-height', async (height, cb) => {
                    const block = await this.blockchain.getBlockByHeight(height)
                    cb(Block.minify(block))
                })
                this.httpApi.on('get-block-hash', async (hash, cb) => {
                    const block = await this.blockchain.getBlockByHash(hash)
                    cb(Block.minify(block))
                })
                this.httpApi.on('get-block-latest', async cb => {
                    const block = await this.blockchain.getLatestBlock()
                    cb(Block.minify(block))
                })
                this.httpApi.on('get-balance-address', async (address, cb) => {
                    cb(beautifyBigInt(await this.blockchain.getBalanceOfAddress(address)))
                })
                this.httpApi.on('transaction', async (transaction, cb) => this.emit('add-transaction', transaction, code => cb(code)))
                this.httpApi.on('block', async (block, cb) => this.emit('add-block', block, code => cb(code)))
                this.httpApi.on('get-peers', async cb => {
                    const arr = []
                    for (const peer of this.tcpNode.peers) arr.push(`${peer.remoteAddress}:${peer.remotePort}`)
                    cb(arr)
                })
            }

            // TCP API
            if (config_settings.Node.TCPApi === true) {
                this.tcpApi.start()
            }

            // TCP NODE
            if (config_settings.Node.TCPNode === true) {
                this.tcpNode.start()
                this.tcpNode.on('block', (block, cb) => this.emit('add-block', block, code => {
                    cb(code)
                }))
                this.tcpNode.on('transaction', (transaction, cb) => this.emit('add-transaction', transaction, code => cb(code)))
                this.tcpNode.on('node', (node, cb) => {
                    if (config_settings.Node.connectToNetwork) cb(this.tcpNode.connectToNode(node))
                })
                this.tcpNode.on('sync', async (height: number, cb) => {
                    const blocks = []
                    for (let i = 0; i < config_settings.Node.syncBlocks; i++) {
                        const block = await this.blockchain.getBlockByHeight(height + i)
                        if (!block) break
                        blocks.push(Block.minify(block))
                    }
                    cb(blocks)
                })
                this.tcpNode.on('blocks', (blocks, cb) => {
                    for (let i = 0; i < blocks.length; i++) {
                        const block = blocks[i]
                        this.emit('add-block', block, code => {
                            if (code === 0x0n && i === blocks.length - 1) {
                                this.sync.timeout = 0
                                this.sync.height = block.height + 1
                            }
                            cb(code)
                        })
                    }
                })
            }
            if (config_settings.Node.connectToNetwork === true) {
                log.info('Connecting to network')
                this.reconnect()
            }
            if (config_settings.Node.sync === true) {
                log.info('Starting to synchronize')
                await this.syncLoop()
            }
            this.nextBlock()
            this.nextTransaction()
        })
        this.on('add-block', async (block: Block, cb: Function) => {
            if (!this.blockchain.loaded) return
            if (!block.hash) return
            if (this.blockchain.hashes[block.height]?.equals(block.hash)) {
                this.verifyrate.hashes++
                return cb(0x0n)
            }
            if (this.queue.callbacks.has(block.hash.toString('hex'))) return this.queue.callbacks.set(block.hash.toString('hex'), [ ...this.queue.callbacks.get(block.hash.toString('hex')), cb ])
            this.queue.callbacks.set(block.hash.toString('hex'), [ cb ])
            this.queue.blocks.add(block)
        })
        this.on('add-transaction', async (transaction: Transaction, cb: Function) => {
            if (this.queue.transactions.size > config_settings.Node.queue.transactions) return
            if (this.queue.callbacks.has(transaction.signature.toString('hex'))) return this.queue.callbacks.set(transaction.signature.toString('hex'), [ ...this.queue.callbacks.get(transaction.signature.toString('hex')), cb ])
            this.queue.callbacks.set(transaction.signature.toString('hex'), [ cb ])
            this.queue.transactions.add(transaction)
        })
        this.on('block', (block, code) => {
            if (code) return
            const buffer = protocol.constructBuffer('block', Block.minify(block))
            this.tcpNode.broadcast(buffer)
            if (config_settings.Node.TCPApi === true) this.tcpApi.broadcast(buffer)
        })
        this.on('transaction', (transaction, code) => {
            if (code) return
            const buffer = protocol.constructBuffer('transaction', Transaction.minify(transaction))
            this.tcpNode.broadcast(buffer)
            if (config_settings.Node.TCPApi === true) this.tcpApi.broadcast(buffer)
        })
        this.verifyrate = {
            transaction: 0,
            block: 0,
            hashes: 0
        }
    }
    async syncLoop() {
        const latestBlock = await this.blockchain.getLatestBlock()
        this.sync.height = latestBlock.height - config_settings.Blockchain.trustedAfterBlocks
        if (this.sync.height < 0) this.sync.height = 0
        log.debug(3, 'syncLoop', this.sync.height)
        if (config_settings.Node.syncLoop) setTimeout(this.syncLoop.bind(this), config_settings.Node.syncLoop)
    }
    async getNodes() {
        return new Promise<Array<string>>(resolve => {
            const stream = this.nodes.createReadStream()
            const _nodes: Array<string> = []
            stream.on('data', node => {
                if (node.value <= Date.now() - config_settings.Node.banTimeout) _nodes.push(node.key)
            })
            stream.on('end', () => {
                resolve(_nodes)
            })
        })
    }
    async reconnect() {
        log.debug(3, 'Reconnecting to network')
        const nodes = await this.getNodes()
        log.debug(4, nodes)
        this.tcpNode.connectToNetwork(nodes)
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
                        resolve(BigInt(e))
                    })
                }
                onMessage()
                return
            }
            reject()
        })
    }
    async nextBlock() {
        log.debug(5, 'nextBlock')
        const block = [...this.queue.blocks].sort((a, b) => a.height - b.height)[0]
        if (block === undefined) {
            this.nextSync()
            return setTimeout(this.nextBlock.bind(this), 10)
        }
        if (this.workersReady.size === 0) return setImmediate(this.nextBlock.bind(this))
        this.queue.blocks.delete(block)
        let code = 0x0n
        try {
            code |= await this.assignJob({
                e: 'block',
                block: Block.minify(block)
            })
        }
        catch {}
        if (!code) code |= await this.blockchain.addBlock(block)
        if (this.queue.callbacks.has(block.hash.toString('hex'))) {
            const cbs = this.queue.callbacks.get(block.hash.toString('hex'))
            for (const cb of cbs) cb(code)
            this.queue.callbacks.delete(block.hash.toString('hex'))
        }
        this.emit('block', block, code)
        log.debug(2, 'Block:', block.hash.toString('hex'), block.height, '0x' + code.toString(16))
        setImmediate(this.nextBlock.bind(this))
    }
    async nextTransaction() {
        log.debug(5, 'nextTransaction')
        const transaction = [...this.queue.transactions].sort((a, b) => a.timestamp - b.timestamp)[0]
        if (transaction === undefined) return setTimeout(this.nextTransaction.bind(this), 10)
        if (this.workersReady.size === 0) return setImmediate(this.nextTransaction.bind(this))
        this.queue.transactions.delete(transaction)
        let code = 0x0n
        try {
            code |= await this.assignJob({
                e: 'transaction',
                transaction: Transaction.minify(transaction)
            })
        }
        catch {}
        if (!code) code |= await this.blockchain.addTransaction(transaction)
        if (this.queue.callbacks.has(transaction.signature.toString('hex'))) {
            const cbs = this.queue.callbacks.get(transaction.signature.toString('hex'))
            for (const cb of cbs) cb(code)
            this.queue.callbacks.delete(transaction.signature.toString('hex'))
        }
        this.emit('transaction', transaction, code)
        log.debug(2, 'Transaction:', '0x' + code.toString(16))
        setImmediate(this.nextTransaction.bind(this))
    }
    async nextSync() {
        if (this.sync.timestamp > Date.now() - this.sync.timeout) return
        this.sync = {
            timeout: config_settings.Node.syncTimeout,
            timestamp: Date.now(),
            height: this.sync.height
        }
        log.debug(4, 'Sync', this.sync.height)
        await this.tcpNode.broadcast(protocol.constructBuffer('sync', this.sync.height), true)
    }
}
export default Node