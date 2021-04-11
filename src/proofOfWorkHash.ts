import * as argon2 from 'argon2'
const salt = Buffer.alloc(8),
options = {
    hashLength: 32,
    timeCost: 1,
    memoryCost: 2**10,
    parallelism: 1,
    type: argon2.argon2d
}
export default async plain => {
    return await argon2.hash(plain, { raw: true, salt, ...options })
}