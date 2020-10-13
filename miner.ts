import * as dotenv from 'dotenv'
dotenv.config()
import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import * as crypto from 'crypto'
import Miner from './src/class/Miner'
import * as keys from './keys.json'

const miner = new Miner(keys[0].publicKey, true)
const socket = miner.clientNode.createSocket('localhost', 8333)
socket.on('connect', () => {
    socket.write(crypto.randomBytes(16))
    miner.start()
    setTimeout(() => {
        miner.stop()
    }, 1000)
})
miner.clientNode.on('data', data => {
    if (!miner.clientNode.verifyData(data)) return
    console.log(data)
    miner.clientNode.broadcast(data)
})