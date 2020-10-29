import * as events from 'events'
import ServerNode from './ServerNode'
import ClientNode from './ClientNode'
import Node from './Node'
import * as config from '../../config.json'
import Blockchain from './Blockchain'
import Block from './Block'
import Transaction from './Transaction'
interface FullNode {
    blockchain: Blockchain
    serverNode: ServerNode
    clientNode: ClientNode
    node: Node
    intermediate: NodeJS.Immediate
}
class FullNode extends events.EventEmitter {
    constructor() {
        super()
        this.blockchain = new Blockchain()
        this.serverNode = new ServerNode()
        this.serverNode
            .on('data', data => this.emit('data', data))
            .on('listening', () => this.emit('listening'))
        this.clientNode = new ClientNode()
        this.clientNode.on('data', data => this.emit('data', data))
        this.node = new Node()
        this.on('data', this.handleData)
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
    connectToNetwork(nodes: Array<{ port: number, address: string }>) {
        for (const node of nodes) {
            if (node.port === config.network.port
                && node.address === config.network.address) continue
            const socket = this.clientNode.createSocket(node.port, node.address)
            socket.on('connect', () => console.log('connected to socket :)'))
        }
    }
    async handleData(data) {
        if (!this.node.verifyData(data)) return
        const processed = this.node.processData(data)
        if (processed === null) return
        switch (processed.type) {
            case 'block':
                const block = new Block(processed.data)
                await this.blockchain.addBlock(block)
                this.emit('block', block)
                break
            case 'transaction':
                const transaction = new Transaction(processed.data)
                const code = await this.blockchain.addTransaction(transaction)
                this.emit('transaction', transaction, code)
                break
        }
        this.broadcastAndStoreDataHash(data)
    }
}
export default FullNode