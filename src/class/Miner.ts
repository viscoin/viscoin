import Blockchain from './Blockchain'
import ClientNode from './ClientNode'
import * as config from '../../config.json'
interface Miner {
    blockchain: Blockchain
    wallet: string
    log: boolean
    mining: boolean
    clientNode: ClientNode
}
class Miner {
    constructor(wallet: string, log: boolean) {
        this.blockchain = new Blockchain()
        this.wallet = wallet
        this.log = log
        this.mining = false,
        this.clientNode = new ClientNode()
    }
    async start() {
        this.mining = true
        await this.blockchain.loadLatestBlocks(config.length.inMemoryChain)
        while (this.mining) {
            await this.blockchain.minePendingTransactions(this.wallet)
            if (this.log) console.log(this.blockchain.getLatestBlock().height, this.blockchain.getLatestBlock().hash)
        }
    }
    stop() {
        this.mining = false
    }
}
export default Miner