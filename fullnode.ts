import Node from './src/Node'
import NodeThread from './src/NodeThread'
import { Worker, isMainThread } from 'worker_threads'
import { setPriority, cpus } from 'os'
import * as level from 'level'
import * as fs from 'fs'

if (isMainThread) {
    if (!fs.existsSync('./db')) fs.mkdirSync('./db')
    const nodes = level('./db/nodes', { keyEncoding: 'utf8', valueEncoding: 'utf8' })
    const blocks = level('./db/blocks', { keyEncoding: 'binary', valueEncoding: 'json' })
    const hashes = level('./db/hashes', { keyEncoding: 'binary', valueEncoding: 'json' })
    const node = new Node({ nodes, blocks, hashes })
    setPriority(19)
    for (let i = 0; i < node.threads; i++) node.addWorker(new Worker(__filename))
}
else new NodeThread()