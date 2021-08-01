# Moneda
##  Goals

- [x] secure wallets with aes-256 bit encryption
- [x] upgrade database from sqlite3 to better-sqlite3
- [x] fix syncronous problems and locks
- [ ] edge case no peers bug fixes
- [x] remove ramda, lodash dependency
- [ ] remove oop principles entirely
- [ ] offer fully syncronous / event based app with boundary async
- [ ] get blocks on the network (visible in GUI)
- [ ] turn this into an executable / service
- [ ] improve block sign & verify crypto security
- [ ] document what is being offered!
## Features
- [ ] Unmanaged Network (self discovering)
- [ ] Secure PoW Blockchain

## Tools
```bash
# Count lines of code
cloc --exclude-dir=node_modules,package-lock.json,config.json,README.md,package.json . --by-file

# To test
npm start
```