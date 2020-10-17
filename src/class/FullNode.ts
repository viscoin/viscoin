import * as events from 'events'
import StorageNode from './StorageNode'
import ServerNode from './ServerNode'
import ClientNode from './ClientNode'
import * as config from '../../config.json'
interface FullNode {
    storageNode: StorageNode
    serverNode: ServerNode
    clientNode: ClientNode
    running: boolean
    intermediate: NodeJS.Immediate
}
class FullNode extends events.EventEmitter {
    constructor() {
        super()

        // ServerNode
        this.serverNode = new ServerNode()
        this.serverNode
            .on('data', data => this.emit('data', data))

        // ClientNode
        this.clientNode = new ClientNode()
        this.clientNode
            .on('data', data => this.emit('data', data))
            .createSocket(config.port, 'localhost')

        // StorageNode
        this.storageNode = new StorageNode()
        this.storageNode
            .on('block', (block, forked) => this.emit('block', block, forked))
            .on('transaction', (transaction, code) => this.emit('transaction', transaction, code))
            .on('loaded', () => this.emit('loaded'))
        this.storageNode.loadBlocksFromStorage()
        this.storageNode.clientNode.createSocket(config.port, 'localhost')

        this.running = false

        this.on('data', data => {
            this.serverNode.broadcastAndStoreDataHash(data)
            this.clientNode.broadcastAndStoreDataHash(data)
        })
    }
    start(port: number, address: string) {
        this.running = true
        this.serverNode.start(port, address)
        this.loop()
        this.emit('start')
    }
    stop() {
        this.running = false
        clearImmediate(this.intermediate)
        this.emit('stop')
    }
    loop() {
        process.nextTick(() => {
            const block = this.storageNode.blockchain.getLatestBlock()
            const buffer = Buffer.from(Buffer.alloc(1, ClientNode.getType('block')) + JSON.stringify(block))
            this.serverNode.broadcastAndStoreDataHash(buffer)
            this.clientNode.broadcastAndStoreDataHash(buffer)
            // loop
            // this.intermediate = setImmediate(() => {
            //     if (this.running) this.loop()
            // }, config.delay.loop)
            setTimeout(() => {
                if (this.running) this.loop()
            }, config.delay.loop)
        })
    }
}
export default FullNode