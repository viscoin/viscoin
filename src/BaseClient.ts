import Blockchain from "./Blockchain"
import TCPNetworkNode from "./TCPNetworkNode"
import TCPApi from "./TCPApi"
import HTTPApi from "./HTTPApi"
import * as config from '../config.json'
import * as nodes from '../nodes.json'
import * as events from 'events'
import protocol from './protocol'
import Block from './Block'
import * as fs from 'fs'
import Transaction from "./Transaction"
import beautifyBigInt from "./beautifyBigInt"
interface BaseClient {
    node: TCPNetworkNode
    tcpApi: TCPApi
    httpApi: HTTPApi
    blockchain: Blockchain
}
class BaseClient extends events.EventEmitter {
    constructor() {
        super()
        if (config.api.tcp.enabled) {
            this.tcpApi = new TCPApi()
            this.tcpApi.start()
        }
        if (config.api.http.enabled) {
            this.httpApi = new HTTPApi()
            this.httpApi.start()
            this.httpApi.on('config', res => {
                res.end(JSON.stringify(config, null, 4))
            })
            this.httpApi.on('pending-transactions', res => {
                res.end(JSON.stringify(this.blockchain.pendingTransactions.map(e => Transaction.minify(e)), null, 4))
            })

            this.httpApi.on('block', async (res, height) => {
                const block = await this.blockchain.getBlockByHeight(height)
                if (!block) return res.status(404).end()
                res.end(JSON.stringify(Block.minify(block), null, 4))
            })
            this.httpApi.on('latest-block', async res => {
                const block = await this.blockchain.getLatestBlock()
                if (!block) return res.status(404).end()
                res.end(JSON.stringify(Block.minify(block), null, 4))
            })
            this.httpApi.on('address-transactions', async (res, address) => {
                const { transactions } = await this.blockchain.getTransactionsOfAddress(address)
                res.end(JSON.stringify(transactions.map(e => Transaction.minify(e)), null, 4))
            })
            this.httpApi.on('address-balance', async (res, address) => {
                const balance = await this.blockchain.getBalanceOfAddress(address)
                res.end(JSON.stringify(beautifyBigInt(balance), null, 4))
            })
            this.httpApi.on('send', async (res, transaction) => {
                const code = await this.blockchain.addTransaction(transaction)
                this.emit('transaction', transaction, code)
                res.end(JSON.stringify(code), null, 4)
            })
        }
        this.node = new TCPNetworkNode()
        this.blockchain = new Blockchain()
        if (config.node.hostNode) this.node.start()
        if (config.node.connectToNodes) this.node.connectToNetwork(nodes)
        if (config.node.blockchainSynchronization) this.nextSync()
        this.node.on('block', async block => {
            const code = await this.blockchain.addBlock(block)
            this.emit('block', block, code)
        })
        this.node.on('transaction', async transaction => {
            const code = await this.blockchain.addTransaction(transaction)
            this.emit('transaction', transaction, code)
        })
        this.node.on('node', node => this.emit('node', node))
        this.node.on('data', data => this.emit('data', data))
        this.node.on('socket', socket => {
            if (!fs.existsSync('./log')) fs.mkdirSync('./log')
            if (config.save_logs) fs.appendFileSync('./log/nodes.txt', `${socket.remoteAddress}:${socket.remotePort}\n`)
            this.emit('socket', socket)
        })
        this.node.on('connect', socket => this.emit('connect', socket))
        this.node.on('connection', socket => this.emit('connection', socket))
        this.node.server.on('listening', () => this.emit('listening'))
        this.node.on('blacklist', (socket, reason) => {
            if (!fs.existsSync('./log')) fs.mkdirSync('./log')
            if (config.save_logs) fs.appendFileSync('./log/blacklisted.txt', `${socket.remoteAddress}:${socket.remotePort}\n`)
            this.emit('blacklist', socket, reason)
        })
    }
    async nextSync() {
        const block = await this.blockchain.getNextSyncBlock()
        if (block) {
            const buffer = protocol.constructDataBuffer('block', Block.minify(block))
            this.node.broadcast(buffer)
        }
        setTimeout(this.nextSync.bind(this), config.node.blockchainSynchronization.timeout)
    }
}
export default BaseClient