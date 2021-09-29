import * as default_env from './config/default_env.json'
import MinerThread from './src/MinerThread'
import { Worker, isMainThread } from 'worker_threads'
import Address from './src/Address'
import Miner from './src/Miner'
import base58 from './src/base58'
import { setPriority } from 'os'
import log from './src/log'
import { execSync } from 'child_process'

if (isMainThread) {
    let commit = null
    try {
        commit = execSync('git rev-parse HEAD').toString().trim()
        log.info('Viscoin Miner:', commit)
    }
    catch {
        log.warn('Git is not installed')
    }
    log.info("If you see that your hashrate is stuck at 0 you most likely haven't properly configured HTTP_API & TCP_API in ./config/default_env.json")
    log.info('Make sure that your system clock is synchronized with the world clock. You can check it here: https://time.is/')
    const ADDRESS = process.env.ADDRESS || default_env.ADDRESS
    if (ADDRESS === 'your_mining_address') {
        log.error('You must set your mining reward address!\nTo do so edit ./config/default_env.json and replace "your_mining_address" with your own address.')
        process.exit()
    }
    const address = Address.toBuffer(ADDRESS)
    if (process.env.ADDRESS) log.info('Using ADDRESS:', ADDRESS, address)
    else log.warn('Unset environment value! Using default value for ADDRESS:', ADDRESS, address)
    if (!Address.verifyChecksumAddress(base58.decode(ADDRESS))) log.warn('Address has invalid checksum! Is the address or checksum incorrect?')
    const miner = new Miner(address)
    setPriority(19)
    for (let i = 0; i < miner.threads; i++) miner.addWorker(new Worker(__filename))
}
else new MinerThread()