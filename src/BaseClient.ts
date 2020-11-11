import Blockchain from "./Blockchain"
import TCPNetworkNode from "./TCPNetworkNode"
import * as config from '../config.json'
import * as nodes from '../nodes.json'
import * as events from 'events'
import protocol from './protocol'
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
        // if (config.node.blockchainSynchronization.enabled) {
        //     setTimeout(async function loop() {
        //         const block = await this.blockchain.getNextSyncBlock()
        //         const buffer = protocol.constructDataBuffer('block', block)
        //         this.node.broadcastAndStoreDataHash(buffer)
        //         setTimeout(loop, config.node.blockchainSynchronization.timeout)
        //     })
        // }
        this.node.on('block', block => {
            this.emit('block', block)
            this.blockchain.addBlock(block)
        })
        this.node.on('transaction', transaction => {
            this.emit('transaction', transaction)
            this.blockchain.addTransaction(transaction)
        })
        this.node.on('node', data => {
            this.emit('node', data)
            if (config.node.connectToNodes) this.node.connectToNetwork([ data.data ])
        })
        this.node.server.on('listening', () => {
            this.emit('listening')
        })
    }
}
export default BaseClient