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
                    parentPort.postMessage(Transaction.spawn(e.transaction).isValid().toString())
                    break
                case 'block':
                    try {
                        const block = Block.spawn(e.block)
                        this.verifyrate.block++
                        this.verifyrate.transaction += block.transactions.length
                        parentPort.postMessage((await block.isValid()).toString())
                    }
                    catch {
                        parentPort.postMessage(0x800000000000000000n.toString())
                    }
                    break
            }
        })
    }
}
export default NodeThread