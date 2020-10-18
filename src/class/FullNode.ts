import * as events from 'events'
import ServerNode from './ServerNode'
import ClientNode from './ClientNode'
import * as config from '../../config.json'
import Blockchain from './Blockchain'
import Block from './Block'
import Transaction from './Transaction'
interface FullNode {
    blockchain: Blockchain
    serverNode: ServerNode
    clientNode: ClientNode
    intermediate: NodeJS.Immediate
}
class FullNode extends events.EventEmitter {
    constructor() {
        super()

        // Blockchain
        this.blockchain = new Blockchain()

        // ServerNode
        this.serverNode = new ServerNode()
        this.serverNode
            .on('data', data => this.emit('data', data))
            .on('listening', () => {
                // ClientNode
                this.clientNode = new ClientNode()
                this.clientNode
                    .on('data', data => this.emit('data', data))
                    .createSocket(config.network.port, config.network.address)

                // emit
                this.emit('listening')
            })
            .start(config.network.port, config.network.address)

        this.on('data', async data => {
            if (!this.clientNode.verifyData(data)) return
            const processed = this.clientNode.processData(data)
            if (processed === null) return
            switch (processed.type) {
                case 'block':
                    const block = new Block(processed.data)
                    const forked = this.blockchain.addBlock(block)
                    this.emit('block', block, forked)
                    break
                case 'transaction':
                    const transaction = new Transaction(processed.data)
                    const code = await this.blockchain.addTransaction(transaction)
                    this.emit('transaction', transaction, code)
                    break
            }

            // relay
            this.broadcastAndStoreDataHash(data)
        })

        // load
        this.loadBlocksFromStorage()
    }
    async loadBlocksFromStorage() {
        await this.blockchain.loadLatestBlocks(config.length.inMemoryChain)
        this.emit('loaded')
    }
    broadcastAndStoreDataHash(data: Buffer) {
        this.serverNode.broadcastAndStoreDataHash(data)
        this.clientNode.broadcastAndStoreDataHash(data)
    }
}
export default FullNode