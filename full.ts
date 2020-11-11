import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import * as nodes from './nodes.json'
import * as config from './config.json'
import TCPNetworkNode from './src/TCPNetworkNode'
import Blockchain from './src/Blockchain'
import protocol from './src/protocol'

const node = new TCPNetworkNode()
const blockchain = new Blockchain()
node.start(config.network.port, config.network.address)
node.connectToNetwork(nodes)
if (config.node.blockchainSynchronization.enabled) {
    setTimeout(async function loop() {
        const block = await blockchain.getNextSyncBlock()
        const buffer = protocol.constructDataBuffer('block', block)
        node.broadcast(buffer)
        setTimeout(loop, config.node.blockchainSynchronization.timeout)
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