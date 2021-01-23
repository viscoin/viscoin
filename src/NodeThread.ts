import Transaction from './Transaction'
import { parentPort, threadId } from 'worker_threads'
import toLocaleTimeString from './chalk/LocaleTimeString'
import * as chalk from 'chalk'

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
        console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Forking node')} { threadId: ${chalk.yellowBright(threadId)} }`)
    }
}
export default NodeThread