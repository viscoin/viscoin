import Transaction from './Transaction'
import Block from './Block'
import { parentPort, threadId } from 'worker_threads'

interface NodeThread {
    verifyrate: {
        transaction: number
        block: number
    }
}
class NodeThread {
    constructor() {
        this.verifyrate = {
            transaction: 0,
            block: 0
        }
        setInterval(() => {
            parentPort.postMessage(JSON.stringify({ e: 'verifyrate', verifyrate: this.verifyrate }))
            this.verifyrate = {
                transaction: 0,
                block: 0
            }
        }, 1000)
        parentPort.on('message', async e => {
            e = JSON.parse(e)
            switch (e.e) {
                case 'transaction':
                    this.verifyrate.transaction++
                    parentPort.postMessage(JSON.stringify(new Transaction(Transaction.beautify(e.transaction)).isValid()))
                    break
                case 'block':
                    const block = new Block(Block.beautify(e.block))
                    this.verifyrate.block++
                    this.verifyrate.transaction += block.transactions.length
                    parentPort.postMessage(JSON.stringify(await block.isValid()))
                    break
            }
        })
        parentPort.postMessage(JSON.stringify({ e: 'ready', threadId }))
    }
}
export default NodeThread