import * as dotenv from 'dotenv'
dotenv.config()
import * as mongoose from './src/mongoose/mongoose'
mongoose.init()
import Blockchain from './src/class/Blockchain'
import Transaction from './src/class/Transaction'
import Miner from './src/class/Miner'
import ServerNode from './src/class/ServerNode'
import ClientNode from './src/class/ClientNode'
import * as keys from './keys.json'



// const serverNode = new ServerNode()
// serverNode.start('localhost', 80)
// setTimeout(() => {
//     serverNode.stop()
// }, 10000)
// const clientNode = new ClientNode()
// clientNode.createClient('localhost', 80)
// clientNode.createClient('localhost', 80)
// clientNode.sockets[0].write('01')
// clientNode.sockets[1].write('11')
// setTimeout(() => {
//     serverNode.server.getConnections((err, count) => {
//         console.log(count)
//     })
// }, 50)
// setTimeout(() => {
//     clientNode.sockets[0].destroy()
//     clientNode.sockets[1].destroy()
// }, 100)
// setTimeout(() => {
//     console.log(clientNode.sockets)
// }, 200)











// const miner = new Miner(keys[0].publicKey, true)
// miner.start()
// setTimeout(async () => {
//     miner.stop()
//     // console.log(await miner.blockchain.isChainValid())
// }, 1000)

















(async () => {
    const blockchain = new Blockchain()

    await blockchain.loadLatestBlocks(10)

    for (let i = 0; i < 10; i++) {
        for (const key of keys) {            
            const tx1 = new Transaction({
                fromAddress: key.publicKey,
                toAddress: "uwu",
                amount: 1,
                minerFee: 1,
                blockHeight: blockchain.getLatestBlock().height + 1
            })
            tx1.signTransaction({ publicKey: key.publicKey, privateKey: key.privateKey })
            blockchain.addTransaction(tx1)
            console.log(tx1)

            await blockchain.minePendingTransactions(key.publicKey)
            console.log(blockchain.getLatestBlock().height, blockchain.getLatestBlock().hash)
        }
        
        // await blockchain.minePendingTransactions(keys[0].publicKey)
        // console.log(await blockchain.getBalanceOfAddress(keys[0].publicKey))
    }

    // console.log(blockchain)
    console.log(await blockchain.isChainValid())
})()