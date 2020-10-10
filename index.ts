import * as dotenv from 'dotenv'
dotenv.config()
import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Blockchain from './src/class/Blockchain'

(async () => {
    const blockchain = new Blockchain()
    await blockchain.load_blocks(25, 0)
    for (let i = 0; i < 10; i++) {
        await blockchain.minePendingTransactions("asdfasdf")
        // console.log(blockchain.getLatestBlock())
    }
    // console.log(blockchain)
    // console.log(blockchain.isChainValid())
})()