import * as os from 'os'
import * as chalk from 'chalk'
import LTS from './chalk/LocaleTimeString'
export default () => {
    const cpus = os.cpus()
    console.log(`${LTS()} ${chalk.cyanBright(`Hardware (${chalk.cyan('CPU')})`)}`)
    for (let i = 0; i < cpus.length; i++) {
        console.log(`${chalk.yellowBright(i)} ${chalk.blueBright(cpus[i].model)}`)
    }
}