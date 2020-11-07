import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import FullNode from './src/class/FullNode'
import * as nodes from './nodes.json'
import * as config from './config.json'

const fullNode = new FullNode()
fullNode.connectToNetwork(nodes)
if (config.blockchainSynchronization.enabled) {
    setTimeout(async function loop() {
        await fullNode.blockchainSync()
        setTimeout(loop, config.blockchainSynchronization.timeout)
    })
}

fullNode.on('block', (block, code) => console.log('block', code))
fullNode.on('transaction', (transaction, code) => console.log('transaction', code))
fullNode.on('node', node => console.log('node', node))