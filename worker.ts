import { Worker, isMainThread, parentPort, threadId } from 'worker_threads'
import { cpus } from 'os'
import * as crypto from 'crypto'

if (isMainThread) {
    let i = 0
    setInterval(() => {
        console.log(`Hashrate: ${i} kH/s`)
        i = 0
    }, 1000)
    for (const cpu of cpus()) {
        const worker = new Worker(__filename)
        worker.on('error', e => console.log('error', e))
        worker.on('exit', e => console.log('exit', e))
        worker.on('message', () => i++)
        worker.on('messageerror', e => console.log('messageerror', e))
        worker.on('online', () => console.log('online'))
        console.log(worker.threadId)
    }
}
else {
    console.log(threadId)
    let i = 0
    while (true) {
        crypto.createHash('sha256').update('').digest()
        if (i++ % 1000 === 0) parentPort.postMessage(null)
    }
}