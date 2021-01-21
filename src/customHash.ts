import * as config from '../config.json'
import * as util from 'util'
const { hash: _hash, types, version } = require(`../${config.argon2}`)
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
    return await hash(Buffer.from(data), salt, options)
}