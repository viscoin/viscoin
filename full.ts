import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import FullNode from './src/class/FullNode'
import * as config from './config.json'

const fullNode = new FullNode()
fullNode.on('start', () => console.log('started'))
fullNode.on('stop', () => console.log('stopped'))
fullNode.on('block', (block, forked) => console.log(block, forked))
fullNode.on('transaction', (transaction, code) => console.log(transaction, code))
// fullNode.on('data', data => console.log(data))
fullNode.on('loaded', () => {
    console.log('loaded')
    fullNode.start(config.port, 'localhost')
})