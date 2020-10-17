import * as events from 'events'
import Blockchain from './Blockchain'
import ClientNode from './ClientNode'
import Transaction from './Transaction'
import Block from './Block'
interface StorageNode {
    blockchain: Blockchain
    clientNode: ClientNode
    intermediate: NodeJS.Immediate
}
class StorageNode extends events.EventEmitter {
    constructor() {
        super()
        this.blockchain = new Blockchain()
        this.clientNode = new ClientNode()
        this.clientNode.on('data', async data => {
            if (!this.clientNode.verifyData(data)) return
            const processed = this.clientNode.processData(data)
            if (!processed) return
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
        })
    }
    async loadBlocksFromStorage() {
        await this.blockchain.loadBlocksFromStorage()
        this.emit('loaded')
    }
}
export default StorageNode