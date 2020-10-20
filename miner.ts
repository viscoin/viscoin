import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Miner from './src/class/Miner'
import * as keys from './keys.json'
import * as config from './config.json'
import * as cluster from 'cluster'
import * as os from 'os'
import * as nodes from './nodes.json'
import * as crypto from 'crypto'

const init = () => {
    const miner = new Miner(keys[0].publicKey)
    miner.on('loaded', async () => {
        // const work = await miner.blockchain.getWork()
        // console.log(work)
        // const valid = await miner.blockchain.isChainValid()
        // console.log(valid)
        console.log('loaded')
        miner.start()
        // setTimeout(async () => {
        //     miner.stop()
        //     const work = await miner.blockchain.getWork()
        //     console.log(work)
        //     const valid = await miner.blockchain.isChainValid()
        //     console.log(valid)
        // }, 30000)
    })
    miner.on('listening', () => {
        console.log('listening')
        for (const node of nodes) {
            const socket = miner.clientNode.createSocket(node.port, node.address)
            socket.on('connect', () => console.log('connected to socket :)'))
        }
        // miner.on('data', data => console.log(crypto.createHash('sha256').update(data).digest('base64')))
        // miner.on('start', () => console.log('started mining'))
        // miner.on('stop', () => console.log('stopped mining'))
        // miner.on('null', data => console.log('received null', data))
        // miner.on('block', (block, forked) => console.log(forked, block.hash))
        miner.on('transaction', (transaction, code) => console.log(transaction))
        miner.on('hash', async (found, block) => {
            if (found) {
                console.log(block.height, block.hash.toString('hex'))
                if (block.height === 150) {
                    miner.stop()
                    const work = await miner.blockchain.getWork()
                    console.log(work)
                    const valid = await miner.blockchain.isChainValid()
                    console.log(valid)
                }
            }
        })
        miner.on('fork', async () => {
            // console.log(miner.storageNode.blockchain.getLatestBlock().height, 'new fork')
            // const valid = await miner.storageNode.blockchain.isChainValid()
            // console.log(valid, 'chain valid')
        })
    })
}
const memory = () => {
    if (config.log.memory) {
        setInterval(() => {
            const mem = process.memoryUsage()
            let str = ''
            for (const key in mem) {
                str += ` ${key} ${Math.round(mem[key] / 1024 / 1024 * 100) / 100} MB `
            }
            console.log(str)
        }, 1000)
    }
}
if (config.use.cluster && cluster.isMaster) {
    memory()
    for (let i = 0; i < os.cpus().length; i++) {
        cluster.fork()
            .on('exit', () => {
                cluster.fork()
            })
    }
}
else {
    init()
    memory()
}