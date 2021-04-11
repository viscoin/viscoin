import keygen from './keygen'
export default async (words: Array<string>) => {
    const str = words.join('')
    const buf = Buffer.from(str)
    return await keygen(buf)
}