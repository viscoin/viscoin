import init from './src/mongoose/init'
import Node from './src/Node'
import NodeThread from './src/NodeThread'
import { Worker, isMainThread } from 'worker_threads'
import { setPriority, cpus } from 'os'

if (isMainThread) {
    init()
    const node = new Node()
    setPriority(19)
    for (let i = 0; i < node.threads; i++) node.addWorker(new Worker(__filename))
}
else new NodeThread()