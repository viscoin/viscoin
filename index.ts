import * as dotenv from 'dotenv'
dotenv.config()
import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import * as crypto from 'crypto'
import Blockchain from './src/class/Blockchain'
import Transaction from './src/class/Transaction'

(async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'secp256k1',
        publicKeyEncoding:  { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    })

    const blockchain = new Blockchain()
    
    await blockchain.load_blocks(500, 0)
    
    for (let i = 0; i < 1; i++) {
        await blockchain.minePendingTransactions(publicKey)

        console.log(`Balance: ${blockchain.getBalanceOfAddress(publicKey)}`)
        // console.log(`Balance: ${blockchain.getBalanceOfAddress('uwu')}`)

        for (let j = 0; j < 10; j++) {
            const tx1 = new Transaction({
                fromAddress: publicKey,
                toAddress: "uwu",
                amount: 90
            })
            tx1.signTransaction({ publicKey, privateKey })
            blockchain.addTransaction(tx1)
        }

        await blockchain.minePendingTransactions(publicKey)
        console.log(`Balance: ${blockchain.getBalanceOfAddress(publicKey)}`)
        await blockchain.minePendingTransactions(publicKey)
        console.log(`Balance: ${blockchain.getBalanceOfAddress(publicKey)}`)
        await blockchain.minePendingTransactions(publicKey)
        console.log(`Balance: ${blockchain.getBalanceOfAddress(publicKey)}`)

        // console.log(blockchain.getLatestBlock())
    }

    // console.log(blockchain)

    // console.log(blockchain.isChainValid())
})()