import * as config from '../config.json'
import * as util from 'util'
const { hash: _hash, types, version } = require(`../${config.argon2}`)
const hash = util.promisify(_hash),
salt = Buffer.alloc(8),
options = {
    hashLength: 32,
    timeCost: config.Wallet.argon2.timeCost,
    memoryCost: config.Wallet.argon2.memoryCost,
    parallelism: config.Wallet.argon2.parallelism,
    type: types.argon2id,
    version
}
export default async (data) => {
    return await hash(Buffer.from(data), salt, options)
}