import * as events from 'events'
import StorageNode from './StorageNode'
import ServerNode from './ServerNode'
import ClientNode from './ClientNode'
import * as config from '../../config.json'
interface FullNode {
    storageNode: StorageNode
    serverNode: ServerNode
    clientNode: ClientNode
    intermediate: NodeJS.Immediate
}
class FullNode extends events.EventEmitter {
    constructor() {
        super()

        // ServerNode
        this.serverNode = new ServerNode()
        this.serverNode
            .on('data', data => this.emit('data', data))
            .on('listening', () => {
                // ClientNode
                this.clientNode = new ClientNode()
                this.clientNode
                    .on('data', data => this.emit('data', data))
                this.clientNode.createSocket(config.network.port, config.network.address)

                // StorageNode
                this.storageNode = new StorageNode()
                this.storageNode
                    .on('block', (block, forked) => this.emit('block', block, forked))
                    .on('transaction', (transaction, code) => this.emit('transaction', transaction, code))
                    .on('loaded', () => this.emit('loaded'))
                this.storageNode.loadBlocksFromStorage()
                this.storageNode.clientNode.createSocket(config.network.port, config.network.address)

                // emit
                this.emit('listening')
            })
            .start(config.network.port, config.network.address)

        this.on('data', data => {
            this.serverNode.broadcastAndStoreDataHash(data)
            this.clientNode.broadcastAndStoreDataHash(data)
        })
    }
}
export default FullNode