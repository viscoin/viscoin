import * as dotenv from 'dotenv'
dotenv.config()
import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Miner from './src/class/Miner'
import * as keys from './keys.json'
import * as config from './config.json'
import * as cluster from 'cluster'
import * as os from 'os'

const init = () => {
    const miner = new Miner(keys[0].publicKey, true)
    const socket = miner.clientNode.createSocket('localhost', 8333)
    socket.on('connect', async () => {
        await miner.load()
        miner.start()
        // miner.on('start', () => console.log('started mining'))
        // miner.on('stop', () => console.log('stopped mining'))
        // miner.on('null', data => console.log('received null', data))
        // miner.on('block', data => console.log('received new block', data))
        // miner.on('transaction', data => console.log('received new transaction', data))
        miner.on('hash', (found, block) => {
            if (found) console.log(block.height, block.hash)
        })
    })
}
if (config.use.cluster) {
    if (cluster.isMaster) {
        for (let i = 0; i < os.cpus().length; i++) {
            cluster.fork()
                .on('exit', () => {
                    cluster.fork()
                })
        }
    }
    else {
        init()
    }
}
else {
    init()
}