import * as crypto from 'crypto'
import * as util from 'util'
const { hash: _hash, types, version } = require('../node_modules/argon2/lib/binding/napi-v3/argon2.node')
const hash = util.promisify(_hash),
salt = Buffer.alloc(8),
options = {
    hashLength: 32,
    timeCost: 1,
    memoryCost: 2**10,
    parallelism: 1,
    type: types.argon2d,
    version
}
export default async (data) => {
    return await hash(crypto.createHash('blake2b512').update(data).digest(), salt, options)
}