import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Wallet from './src/class/Wallet'
import * as keys from './keys.json'
import * as config from './config.json'
import * as nodes from './nodes.json'

const wallet = new Wallet(keys[0])
for (const node of nodes) {
    const socket = wallet.clientNode.createSocket(node.port, node.address)
    socket.on('connect', async () => {
        console.log('connected to socket :)')
        wallet.send({
            address: keys[1].publicKey,
            amount: 2,
            minerFee: 1
        })
    })
}