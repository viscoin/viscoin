import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import FullNode from './src/class/FullNode'
import * as nodes from './nodes.json'

const fullNode = new FullNode()
fullNode.hostNetworkNode()
fullNode.on('listening', () => {
    console.log('listening')
    fullNode.connectToNetwork(nodes)
    fullNode.on('transaction', (transaction, code) => console.log(transaction.signature))
    fullNode.on('block', block => console.log(block.height, block.hash.toString('hex')))
    // fullNode.on('data', data => console.log(crypto.createHash('sha256').update(data).digest('base64')))
    // fullNode.on('start', () => console.log('started mining'))
    // fullNode.on('stop', () => console.log('stopped mining'))
    // fullNode.on('null', data => console.log('received null', data))
    // fullNode.on('fork', async () => console.log('forked'))
})