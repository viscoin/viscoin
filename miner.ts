import { config } from 'dotenv'
config()
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