import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import * as nodes from './nodes.json'
import * as config from './config.json'
import TCPNetworkNode from './src/TCPNetworkNode'
import Blockchain from './src/Blockchain'

const node = new TCPNetworkNode()
const blockchain = new Blockchain()
if (config.node.hostNode) node.start(config.network.port, config.network.address)
if (config.node.connectToNodes) node.connectToNetwork(nodes)
if (config.node.blockchainSynchronization.enabled) {
    setTimeout(async function loop() {
        await blockchain.getNextSyncBlock()
        setTimeout(loop, config.node.blockchainSynchronization.timeout)
    })
}
node.on('block', block => {
    blockchain.addBlock(block)
    console.log('block')
})
node.on('transaction', transaction => {
    blockchain.addTransaction(transaction)
    console.log('transaction')
})
node.on('node', data => {
    if (config.node.connectToNodes) node.connectToNetwork([ data.data ])
    console.log('node')
})