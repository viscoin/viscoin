import * as configSettings from '../config/settings.json'
import * as argon2 from 'argon2'
const salt = Buffer.alloc(8),
options = {
    hashLength: 32,
    timeCost: configSettings.Wallet.argon2.timeCost,
    memoryCost: configSettings.Wallet.argon2.memoryCost,
    parallelism: configSettings.Wallet.argon2.parallelism,
    type: argon2.argon2id
}
export default async plain => {
    return await argon2.hash(plain, { raw: true, salt, ...options })
}