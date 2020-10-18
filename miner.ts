import Miner from './src/class/Miner'
import * as keys from './keys.json'
import * as config from './config.json'
import * as cluster from 'cluster'
import * as os from 'os'
import Transaction from './src/class/Transaction'
import * as addresses from './addresses.json'

const init = () => {
    const miner = new Miner(keys[0].publicKey)
    miner.serverNode.start(config.network.port, config.network.address)
    setTimeout(() => {
        for (const address of addresses) {
            const socket = miner.clientNode.createSocket(config.network.port, address)
            console.log(address)
            socket.on('connect', () => {
                console.log('connected to socket :)')
            })
        }
        // await miner.load()
        // await miner.sync()
        miner.start()
        // miner.on('start', () => console.log('started mining'))
        // miner.on('stop', () => console.log('stopped mining'))
        // miner.on('null', data => console.log('received null', data))
        // miner.on('block', data => console.log('received new block', data))
        miner.on('transaction', data => console.log(new Transaction(data)))
        miner.on('hash', (found, block) => {
            if (found) console.log(block.height, block.hash)
        })
        miner.on('fork', async () => {
            console.log(miner.storageNode.blockchain.getLatestBlock().height, 'new fork')
            const valid = await miner.storageNode.blockchain.isChainValid()
            console.log(valid, 'chain valid')
        })
    }, 1000)
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