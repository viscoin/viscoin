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
    tcpServer: TCPApi['Server']
    httpApi: HTTPApi
    blockchain: Blockchain
}
class BaseClient extends events.EventEmitter {
    constructor() {
        super()
        this.node = new TCPNetworkNode()
        this.blockchain = new Blockchain()
        this.tcpServer = TCPApi.createServer()
        this.httpApi = new HTTPApi()
        if (config.BaseClient.hostNode) this.node.start()
        if (config.BaseClient.connectToNodes) this.node.connectToNetwork(nodes)
        if (config.BaseClient.blockchainSynchronization) this.nextSync()
        this.node.on('block', async block => {
            const code = await this.blockchain.addBlock(block)
            this.emit('block', block, code)
        })
        this.node.on('transaction', async transaction => {
            const code = await this.blockchain.addTransaction(transaction)
            this.emit('transaction', transaction, code)
        })
        this.node.on('node', node => {
            if (config.BaseClient.connectToNodes) this.node.connectToNetwork([ <{ port: number, address: string }> node ])
            this.emit('node', node)
        })
        this.node.on('socket', socket => {
            if (!fs.existsSync('./log')) fs.mkdirSync('./log')
            if (config.BaseClient.logs) fs.appendFileSync('./log/nodes.txt', `${socket.remoteAddress}:${socket.remotePort}\n`)
            this.emit('socket', socket)
        })
        this.node.on('blacklist', (socket, reason) => {
            if (!fs.existsSync('./log')) fs.mkdirSync('./log')
            if (config.BaseClient.logs) fs.appendFileSync('./log/blacklisted.txt', `${socket.remoteAddress}:${socket.remotePort}\n`)
            this.emit('blacklist', socket, reason)
        })
        if (config.TCPApi.enabled) {
            this.tcpServer.start()
            this.on('block', (block, code) => {
                if (code === 0) this.tcpServer.broadcast(protocol.constructDataBuffer('block', Block.minify(block)))
            })
            this.on('transaction', (transaction, code) => {
                if (code === 0) this.tcpServer.broadcast(protocol.constructDataBuffer('transaction', Transaction.minify(transaction)))
            })
        }
        if (config.HTTPApi.enabled) {
            this.httpApi.start()
            this.httpApi.on('get-config', res => {
                res.end(JSON.stringify(config, null, 4))
            })
            this.httpApi.on('get-transactions-pending', res => {
                res.end(JSON.stringify(this.blockchain.pendingTransactions.map(e => Transaction.minify(e)), null, 4))
            })
            this.httpApi.on('get-block', async (res, height) => {
                res.end(JSON.stringify(Block.minify(await this.blockchain.getBlockByHeight(height)), null, 4))
            })
            this.httpApi.on('get-block-latest', async res => {
                res.end(JSON.stringify(Block.minify(await this.blockchain.getLatestBlock()), null, 4))
            })
            this.httpApi.on('get-block-new', async (res, address: Buffer) => {
                res.end(JSON.stringify(Block.minify(await this.blockchain.getNewBlock(address)), null, 4))
            })
            this.httpApi.on('get-transactions-address', async (res, address) => {
                const { transactions } = await this.blockchain.getTransactionsOfAddress(address)
                res.end(JSON.stringify(transactions.map(e => Transaction.minify(e)), null, 4))
            })
            this.httpApi.on('get-balance-address', async (res, address) => {
                const balance = await this.blockchain.getBalanceOfAddress(address)
                res.end(JSON.stringify(beautifyBigInt(balance), null, 4))
            })
            this.httpApi.on('post-transaction', async (res, transaction) => {
                const code = await this.blockchain.addTransaction(transaction)
                this.emit('transaction', transaction, code)
                res.end(JSON.stringify(code), null, 4)
            })
            this.httpApi.on('post-block', async (res, block) => {
                const code = await this.blockchain.addBlock(block)
                this.emit('block', block, code)
                res.end(JSON.stringify(code), null, 4)
            })
        }
    }
    async nextSync() {
        const block = await this.blockchain.getNextSyncBlock()
        if (block) {
            const buffer = protocol.constructDataBuffer('block', Block.minify(block))
            this.node.broadcastAndStoreDataHash(buffer)
        }
        setTimeout(this.nextSync.bind(this), config.BaseClient.blockchainSynchronization.timeout)
    }
}
export default BaseClient