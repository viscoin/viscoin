import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Miner from './src/class/Miner'
import * as keys from './keys.json'
import * as nodes from './nodes.json'

const miner = new Miner(keys[0].publicKey)
miner.hostNetworkNode()
miner.connectToNetwork(nodes)
miner.start()
setTimeout(async function loop() {
    await miner.blockchainSync()
    setTimeout(loop, 1000)
})

miner.on('transaction', (transaction, code) => console.log('transaction', code))
miner.on('block', (block, code) => console.log('block', code))
miner.on('node', info => console.log('node', info))
miner.on('hash', async (found, block) => {
    if (found) {
        console.log(block.height, block.hash.toString('hex'))
    }
})
setInterval(async () => {
    console.log('socket connections (server)', miner.serverNode.sockets.length)
    for (const socket of miner.serverNode.sockets) {
        if (!socket) continue
        console.log(socket.remoteAddress, socket.remotePort)
    }
    console.log('socket connections (client)', miner.clientNode.sockets.length)
    for (const socket of miner.clientNode.sockets) {
        if (!socket) continue
        console.log(socket.remoteAddress, socket.remotePort)
    }
    // const work = await miner.blockchain.getWork()
    // console.log('work', work)
    // const valid = await miner.blockchain.isChainValid()
    // console.log('valid', valid)
    // const balance = await miner.blockchain.getBalanceOfAddress(keys[0].publicKey)
    // console.log('balance', balance)
}, 10000)