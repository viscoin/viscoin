import mongoose from './src/mongoose/mongoose'
mongoose.init()
import Blockchain from './src/Blockchain'
(async () => {
    console.log(await new Blockchain().isChainValid())
})()