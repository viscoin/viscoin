import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Wallet from './src/class/Wallet'
import * as keys from './keys.json'
import * as nodes from './nodes.json'
import * as crypto from 'crypto'

const wallet = new Wallet(keys[0])
wallet.on('block', (block, forked) => {
    console.log(forked, block.hash)
    const transaction = wallet.send({
        address: 'uwu',
        amount: 10,
        minerFee: 1
    })
    console.log(transaction)
})
wallet.on('loaded', async () => {
    console.log(await wallet.balance('uwu'))
    console.log(await wallet.balance())
})