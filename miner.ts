import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Miner from './src/class/Miner'
import * as keys from './keys.json'
import * as nodes from './nodes.json'

const miner = new Miner(keys[0].publicKey)
miner.hostNetworkNode()
miner.connectToNetwork(nodes)
miner.start()
miner.on('transaction', (transaction, code) => console.log(transaction.signature))
miner.on('hash', async (found, block) => {
    if (found) {
        console.log(block.height, block.hash.toString('hex'))
        // miner.blockchain.saveTrustedBlock()
    }
})
// miner.on('data', data => console.log(crypto.createHash('sha256').update(data).digest('base64')))
// miner.on('start', () => console.log('started mining'))
// miner.on('stop', () => console.log('stopped mining'))
// miner.on('null', data => console.log('received null', data))
// miner.on('block', (block, forked) => {
//     miner.blockchain.saveTrustedBlock()
// })
// miner.on('fork', async () => console.log('forked'))
setInterval(async () => {
    console.log('socket connections (server)', miner.serverNode.sockets.length)
    console.log('socket connections (client)', miner.clientNode.sockets.length)
    const work = await miner.blockchain.getWork()
    console.log(work)
    const valid = await miner.blockchain.isChainValid()
    console.log(valid)
    const balance = await miner.blockchain.getBalanceOfAddress(keys[0].publicKey)
    console.log(balance)
}, 10000)