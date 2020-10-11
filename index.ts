import * as dotenv from 'dotenv'
dotenv.config()
import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import * as crypto from 'crypto'
import Blockchain from './src/class/Blockchain'
import Transaction from './src/class/Transaction'

(async () => {
    const blockchain = new Blockchain()
    
    await blockchain.load_blocks(1, 0)

    for (let i = 0; i < 1; i++) {
        const key = crypto.generateKeyPairSync('ec', {
            namedCurve: 'secp256k1',
            publicKeyEncoding:  { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        })
        const key2 = crypto.generateKeyPairSync('ec', {
            namedCurve: 'secp256k1',
            publicKeyEncoding:  { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        })
        // const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
        //     namedCurve: 'secp256k1',
        //     publicKeyEncoding:  { type: 'spki', format: 'pem' },
        //     privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        // })

        await blockchain.minePendingTransactions(key.publicKey)
        await blockchain.minePendingTransactions(key2.publicKey)

        console.log(`Balance: ${blockchain.getBalanceOfAddress(key.publicKey)}`)
        console.log(`Balance: ${blockchain.getBalanceOfAddress(key2.publicKey)}`)
        // console.log(`Balance: ${blockchain.getBalanceOfAddress('uwu')}`)

        for (let j = 0; j < 1; j++) {
            const tx1 = new Transaction({
                fromAddress: key.publicKey,
                toAddress: "uwu",
                amount: 1,
                minerFee: 1
            })
            tx1.signTransaction({ publicKey: key.publicKey, privateKey: key.privateKey })
            blockchain.addTransaction(tx1)
            const tx2 = new Transaction({
                fromAddress: key2.publicKey,
                toAddress: "uwu",
                amount: 10,
                minerFee: 5
            })
            tx2.signTransaction({ publicKey: key2.publicKey, privateKey: key2.privateKey })
            blockchain.addTransaction(tx2)
        }

        await blockchain.minePendingTransactions(key.publicKey)
        console.log(`Balance: ${blockchain.getBalanceOfAddress(key.publicKey)}`)
        console.log(`Balance: ${blockchain.getBalanceOfAddress(key2.publicKey)}`)

        // console.log(blockchain.getLatestBlock())
    }

    // console.log(blockchain)

    console.log(blockchain.isChainValid())
})()