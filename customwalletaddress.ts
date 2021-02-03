import * as chalk from 'chalk'
import wordgen from './src/wordgen'
import wordsToKey from './src/wordsToKey'
import base58 from './src/base58'
import { isMainThread, Worker, parentPort } from 'worker_threads'
import { cpus, setPriority } from 'os'
setPriority(19)

const target = base58.encode(base58.decode('vis'))

if (isMainThread) {
    let rate = 0
    setInterval(() => {
        console.log(`${chalk.yellowBright(rate)} ${chalk.redBright('A/s')}`)
        rate = 0
    }, 1000)
    for (let i = 0; i < cpus().length; i++) {
        const worker = new Worker(__filename)
        worker.on('message', async e => {
            e = JSON.parse(e)
            switch (e.e) {
                case 'found':
                    console.log(base58.encode(Buffer.from(e.key.address)))
                    console.log(e.words)
                    break
                case 'rate':
                    rate += e.rate
                    break
            }
        })
    }
}
else {
    let timestamp = Date.now(),
    rate = 0
    const loop = async () => {
        const words = wordgen()
        const key = await wordsToKey(words)
        if (base58.encode(key.address).startsWith(target)) {
            parentPort.postMessage(JSON.stringify({
                e: 'found',
                words,
                key
            }))
        }
        rate++
        if (timestamp <= Date.now() - 1000) {
            timestamp = Date.now()
            parentPort.postMessage(JSON.stringify({
                e: 'rate',
                rate
            }))
            rate = 0
        }
        loop()
    }
    loop()
}