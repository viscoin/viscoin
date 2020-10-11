import * as dotenv from 'dotenv'
dotenv.config()
import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import * as crypto from 'crypto'
import Blockchain from './src/class/Blockchain'
import Transaction from './src/class/Transaction'
import * as keys from './keys.json'

(async () => {
    const blockchain = new Blockchain()

    await blockchain.loadLatestBlocks(10)

    for (let i = 0; i < 100; i++) {
        for (const key of keys) {
            // console.log(key)

            await blockchain.minePendingTransactions(key.publicKey)
            console.log(blockchain.getLatestBlock().height, blockchain.getLatestBlock().hash)
            // console.log(await blockchain.getBalanceOfAddress(key.publicKey))

            // const tx1 = new Transaction({
            //     fromAddress: key.publicKey,
            //     toAddress: "uwu",
            //     amount: 1,
            //     minerFee: 1
            // })
            // tx1.signTransaction({ publicKey: key.publicKey, privateKey: key.privateKey })
            // blockchain.addTransaction(tx1)
            // console.log(tx1)
        }
        
        // await blockchain.minePendingTransactions(keys[0].publicKey)
        // console.log(await blockchain.getBalanceOfAddress(keys[0].publicKey))
    }

    // console.log(blockchain)
    console.log(blockchain.isChainValid())
})()