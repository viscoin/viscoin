import Blockchain from './Blockchain'
import * as config from '../../config.json'
interface Miner {
    blockchain: Blockchain
    wallet: string
    log: boolean
    mining: boolean
}
class Miner {
    constructor(wallet: string, log: boolean) {
        this.blockchain = new Blockchain()
        this.wallet = wallet
        this.log = log
        this.mining = false
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