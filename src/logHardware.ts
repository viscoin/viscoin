import * as os from 'os'
export default () => {
    const cpus = os.cpus()
    for (let i = 0; i < cpus.length; i++) {
        console.log(i, cpus[i].model, cpus[i].speed)
    }
}