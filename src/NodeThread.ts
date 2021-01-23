import Transaction from './Transaction'
import Block from './Block'
import { parentPort, threadId } from 'worker_threads'
import toLocaleTimeString from './chalk/LocaleTimeString'
import * as chalk from 'chalk'

interface NodeThread {
}
class NodeThread {
    constructor() {
        parentPort.on('message', async e => {
            e = JSON.parse(e)
            switch (e.e) {
                case 'transaction':
                    parentPort.postMessage(JSON.stringify(new Transaction(Transaction.beautify(e.transaction)).isValid()))
                    break
                case 'block':
                    parentPort.postMessage(JSON.stringify(await new Block(Block.beautify(e.block)).isValid()))
                    break
            }
        })
        parentPort.postMessage(JSON.stringify({ e: 'ready' }))
        console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Forking node')} { threadId: ${chalk.yellowBright(threadId)} }`)
    }
}
export default NodeThread