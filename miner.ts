import * as dotenv from 'dotenv'
dotenv.config()
import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Miner from './src/class/Miner'
import * as keys from './keys.json'
import Transaction from './src/class/Transaction'

const miner = new Miner(keys[0].publicKey, true)
const socket = miner.clientNode.createSocket('localhost', 8333)
socket.on('connect', () => {
    miner.start()
    setTimeout(() => {
        miner.stop()
    }, 10000)
})