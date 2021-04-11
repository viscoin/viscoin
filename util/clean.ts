import init from '../src/mongoose/init'
init()
import Blockchain from '../src/Blockchain'
(async () => console.log(await new Blockchain().deleteAllBlocksNotIncludedInChain()))()