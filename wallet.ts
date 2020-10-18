import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Wallet from './src/class/Wallet'
import * as keys from './keys.json'
import * as nodes from './nodes.json'
import * as crypto from 'crypto'

const wallet = new Wallet(keys[0])
wallet.on('loaded', () => {
    console.log('loaded')
})
wallet.on('listening', () => {
    console.log('listening')
    for (const node of nodes) {
        const socket = wallet.clientNode.createSocket(node.port, node.address)
        socket.on('connect', () => console.log('connected to socket :)'))
    }
    // wallet.on('data', data => console.log(crypto.createHash('sha256').update(data).digest('base64')))
})
setTimeout(() => {
    const transaction = wallet.send({
        address: 'uwu',
        amount: 10,
        minerFee: 1
    })
    console.log(transaction)
    console.log(wallet.serverNode.sockets.length)
    console.log(wallet.clientNode.sockets.length)
}, 1000)