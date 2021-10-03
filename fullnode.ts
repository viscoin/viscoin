import Node from './src/Node'
import NodeThread from './src/NodeThread'
import { Worker, isMainThread } from 'worker_threads'
import { setPriority, cpus } from 'os'
import * as level from 'level'
import * as fs from 'fs'
import { execSync } from 'child_process'
import log from './src/log'
import * as settings from './config/settings.json'
import * as path from 'path'

if (isMainThread) {
    setTimeout(() => {
        log.info('Restarting...')
        process.exit(0)
    }, settings.Node.restartAfter)
    let commit = null
    try {
        commit = execSync('git rev-parse HEAD').toString().trim()
        log.info('Viscoin Node:', commit)
    }
    catch {
        log.warn('Git is not installed')
    }
    if (!fs.existsSync(settings.Node.dbPath)) fs.mkdirSync(settings.Node.dbPath)
    const nodes = level(path.join(settings.Node.dbPath, 'nodes'), { keyEncoding: 'utf8', valueEncoding: 'utf8' })
    const blocks = level(path.join(settings.Node.dbPath, 'blocks'), { keyEncoding: 'binary', valueEncoding: 'json' })
    const node = new Node({ nodes, blocks }, commit)
    setPriority(19)
    for (let i = 0; i < node.threads; i++) node.addWorker(new Worker(__filename))
}
else new NodeThread()