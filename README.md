# simple-add

A very simple addition utility.

## Install

```bash
npm install simple-add
```

## Usage

```js
const { add, subtract } = require('simple-add');

add(2, 3);      // 5
subtract(5, 3); // 2
```

Both functions throw a `TypeError` if either argument is not a number.

## Test

```bash
npm test
```

## License

MIT
