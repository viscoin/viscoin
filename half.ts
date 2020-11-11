import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import * as nodes from './nodes.json'
import * as config from './config.json'
import TCPNetworkNode from './src/TCPNetworkNode'
import Blockchain from './src/Blockchain'

const node = new TCPNetworkNode()
const blockchain = new Blockchain()
node.connectToNetwork(nodes)
if (config.blockchainSynchronization.enabled) {
    setTimeout(async function loop() {
        await blockchain.getNextSyncBlock()
        setTimeout(loop, config.blockchainSynchronization.timeout)
    })
}
node.on('block', block => {
    blockchain.addBlock(block)
    console.log('block', block)
})
node.on('transaction', transaction => {
    blockchain.addTransaction(transaction)
    console.log('transaction', transaction)
})
node.on('node', data => {
    node.connectToNetwork([ data.data ])
    console.log('node', node)
})