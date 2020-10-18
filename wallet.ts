import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Wallet from './src/class/Wallet'
import * as keys from './keys.json'
import * as config from './config.json'

const wallet = new Wallet(keys[0])
const socket = wallet.clientNode.createSocket(config.network.port, config.network.address)
socket.on('connect', async () => {
    const balance = await wallet.balance()
    console.log(balance)
    wallet.send({
        address: keys[1].publicKey,
        amount: 2,
        minerFee: 1
    })
})