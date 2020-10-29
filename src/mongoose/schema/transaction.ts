import * as mongoose from 'mongoose'
const schema = mongoose.Schema({
    hash: Buffer,
    fromAddress: String,
    toAddress: String,
    amount: Number,
    minerFee: Number,
    signature: Buffer,
    timestamp: Number
},
{
    collection: "transactions"
})
export default mongoose.model("Transaction", schema)