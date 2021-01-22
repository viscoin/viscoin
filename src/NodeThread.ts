import Transaction from './Transaction'
import { parentPort } from 'worker_threads'
interface NodeThread {
}
class NodeThread {
    constructor() {
        parentPort.on('message', e => {
            e = JSON.parse(e)
            switch (e.e) {
                case 'transaction':
                    parentPort.postMessage(JSON.stringify(new Transaction(Transaction.beautify(e.transaction)).isValid()))
                    break
            }
        })
        parentPort.postMessage(JSON.stringify({ e: 'ready' }))
    }
}
export default NodeThread