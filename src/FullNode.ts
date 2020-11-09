import * as events from 'events'
import ServerNode from './ServerNode'
import ClientNode from './ClientNode'
import Node from './Node'
import * as config from '../config.json'
import Blockchain from './Blockchain'
import Block from './Block'
import Transaction from './Transaction'
import schema_node from './mongoose/schema/node'
interface FullNode {
    blockchain: Blockchain
    serverNode: ServerNode
    clientNode: ClientNode
    node: Node
    intermediate: NodeJS.Immediate
    blockchainSyncIndex: number
}
class FullNode extends events.EventEmitter {
    constructor() {
        super()
        this.blockchain = new Blockchain()
        this.serverNode = new ServerNode()
        this.serverNode
            .on('data', data => this.emit('data', data))
            .on('listening', () => this.emit('listening'))
            // Or disable this one to make sure only emitted sockets are of remote type serverNode
            // .on('socket', socket => this.emit('socket', socket))
        this.clientNode = new ClientNode()
        this.clientNode
            .on('data', data => this.emit('data', data))
            .on('socket', socket => this.emit('socket', socket))
        this.node = new Node()
        this.on('data', this.handleData)
        this.on('socket', this.handleSocket)
        this.blockchainSyncIndex = 0
    }
    broadcastAndStoreDataHash(data: Buffer) {
        this.serverNode.broadcastAndStoreDataHash(data)
        this.clientNode.broadcastAndStoreDataHash(data)
    }
    broadcast(data: Buffer) {
        this.serverNode.broadcast(data)
        this.clientNode.broadcast(data)
    }
    hostNetworkNode() {
        this.serverNode.start(config.network.port, config.network.address)
    }
    closeNetworkNode() {
        this.serverNode.stop()
    }
    connectToNetwork(nodes: Array<{ port: number, address: string }>) {
        for (const node of nodes) {
            if (typeof node.port !== 'number') continue
            if (typeof node.address !== 'string') continue
            if (node.port < 0 || node.port > 65535) continue
            if (node.address !== 'localhost') {
                if (Buffer.byteLength(Buffer.from(node.address.split('.'))) !== 4
                    && Buffer.byteLength(Buffer.from(node.address.split(':'))) > 16) continue
            }
            if (node.port === config.network.port
                && node.address === config.network.address) continue
            const socket = this.clientNode.createSocket(node.port, node.address)
            socket.on('connect', () => console.log('connected to socket :)'))
        }
    }
    disconnectFromNetwork() {
        for (const socket of this.clientNode.sockets) {
            socket.destroy()
        }
        this.clientNode.sockets = []
    }
    async blockchainSync() {
        const block = await this.blockchain.getBlockByHeight(this.blockchainSyncIndex++)
        if (this.blockchainSyncIndex >= (await this.blockchain.getLatestBlock()).height - config.mining.trustedAfterBlocks) this.blockchainSyncIndex = 0
        const data = Node.constructDataBuffer('block', block)
        this.broadcast(data)
    }
    async handleData(data) {
        if (!this.node.verifyData(data)) return
        const processed = this.node.processData(data)
        if (processed === null) return
        switch (processed.type) {
            case 'block':
                if (!processed.data) return
                const block = new Block(processed.data)
                const blockCode = await this.blockchain.addBlock(block)
                this.emit('block', block, blockCode)
                break
            case 'transaction':
                if (!processed.data) return
                const transaction = new Transaction(processed.data)
                const transactionCode = await this.blockchain.addTransaction(transaction)
                this.emit('transaction', transaction, transactionCode)
                break
            case 'node':
                // if remote socket is serverNode (probably)
                // if ([8333, 8334, 8335].includes(processed.data.port)) {
                //     this.emit('node', processed.data)
                // }
                if (!processed.data) return
                // if (processed.data.port !== 8333) processed.data.port = 8333
                this.connectToNetwork([ processed.data ])
                this.emit('node', processed.data)
                break
        }
        this.broadcastAndStoreDataHash(data)
    }
    async handleSocket(socket) {
        this.broadcastAndStoreDataHash(Node.constructDataBuffer('node', {
            address: socket.remoteAddress,
            family: socket.remoteFamily,
            port: socket.remotePort
        }))
        if (config.save_connected_nodes) await new schema_node({
            address: socket.remoteAddress,
            family: socket.remoteFamily,
            port: socket.remotePort
        }).save()
    }
}
export default FullNode