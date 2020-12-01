import Blockchain from "./Blockchain"
import TCPNetworkNode from "./TCPNetworkNode"
import * as config from '../config.json'
import * as nodes from '../nodes.json'
import * as events from 'events'
import protocol from './protocol'
import * as fs from 'fs'
interface BaseClient {
    node: TCPNetworkNode
    blockchain: Blockchain
}
class BaseClient extends events.EventEmitter {
    constructor() {
        super()
        this.node = new TCPNetworkNode()
        this.blockchain = new Blockchain()
        if (config.node.hostNode) this.node.start(config.network.port, config.network.address)
        if (config.node.connectToNodes) this.node.connectToNetwork(nodes)
        if (config.node.blockchainSynchronization) this.nextSync()
        this.node.on('block', block => {
            this.blockchain.addBlock(block)
            this.emit('block', block)
        })
        this.node.on('transaction', transaction => {
            this.blockchain.addTransaction(transaction)
            this.emit('transaction', transaction)
        })
        this.node.on('node', node => this.emit('node', node))
        this.node.on('data', data => this.emit('data', data))
        this.node.on('socket', socket => {
            fs.appendFileSync('./log/nodes.txt', `${socket.remoteAddress}:${socket.remotePort}\n`)
            this.emit('socket', socket)
        })
        this.node.on('connect', socket => this.emit('connect', socket))
        this.node.on('connection', socket => this.emit('connection', socket))
        this.node.server.on('listening', () => this.emit('listening'))
        this.node.on('blacklist', (socket, reason) => this.emit('blacklist', socket, reason))
    }
    async nextSync() {
        const block = await this.blockchain.getNextSyncBlock()
        const buffer = protocol.constructDataBuffer('block', block)
        this.node.broadcastAndStoreDataHash(buffer)
        setTimeout(this.nextSync.bind(this), config.node.blockchainSynchronization.timeout)
    }
}
export default BaseClient