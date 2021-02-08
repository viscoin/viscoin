import * as configSettings from '../config/settings.json'
import * as util from 'util'
const { hash: _hash, types, version } = require(`../${configSettings.argon2}`)
const hash = util.promisify(_hash),
salt = Buffer.alloc(8),
options = {
    hashLength: 32,
    timeCost: configSettings.Wallet.argon2.timeCost,
    memoryCost: configSettings.Wallet.argon2.memoryCost,
    parallelism: configSettings.Wallet.argon2.parallelism,
    type: types.argon2id,
    version
}
export default async (data) => {
    return await hash(Buffer.from(data), salt, options)
}