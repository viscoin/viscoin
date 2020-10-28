import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Wallet from './src/class/Wallet'
import * as keys from './keys.json'
import * as nodes from './nodes.json'
const wallet = new Wallet(keys[0])
wallet.connectToNetwork(nodes)
wallet.on('block', block => {
    console.log(block.hash.toString('hex'))
})
const transaction = wallet.send({
    address: 'uwu',
    amount: 2,
    minerFee: 1
})
console.log(transaction)
setInterval(async () => {
    // console.log(wallet.clientNode.sockets.length)
    console.log(await wallet.balance())
}, 1000)