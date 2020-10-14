import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Wallet from './src/class/Wallet'
import * as keys from './keys.json'

(async () => {
    const wallet = new Wallet(keys[0])
    const socket = wallet.clientNode.createSocket('localhost', 8333)
    socket.on('connect', async () => {
        const balance = await wallet.balance()
        console.log(balance)
        wallet.send({
            address: keys[1].publicKey,
            amount: 2,
            minerFee: 1
        })
    })
})()