const config = require(`${__dirname}/config.json`)
const Cup = require(`${__dirname}/Cup.js`)
// entry
async function main() {
    const cup = new Cup(config)
    await cup.Run()
}
main()