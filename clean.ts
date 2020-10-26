import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Blockchain from './src/class/Blockchain'

const blockchain = new Blockchain()
blockchain.cleanChain()